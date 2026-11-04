<script setup lang="ts">
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { ref, watch } from 'vue'
import SeatSelector from '../Seats/SeatSelector.vue'
import { getTheaterSeats, updateSeatStatuses } from '@/services/theater.service'
import {
  seatStateLabels,
  seatTypeLabels,
  type Seat,
  type SeatState,
  type SeatType,
} from '@/types/seats.ts'
import SimpleDropdown from '../common/SimpleDropdown.vue'
import { isAxiosError } from 'axios'

const props = withDefaults(
  defineProps<{
    theaterId: number
    rows: number
    columns: number
    disabled?: boolean
    readonly?: boolean
  }>(),
  {
    disabled: false,
    readonly: false,
  },
)

const seats = ref<Seat[]>([])
const selectedSeats = ref<Seat[]>([])
const selectedState = ref<SeatState | null>(null)
const selectedType = ref<SeatType | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const selectorVersion = ref(0)

const selectableStates: SeatState[] = ['free', 'unavailable', 'in-use', 'reserved']

const stateOptions = (Object.keys(seatStateLabels) as SeatState[]).map((id) => ({
  id,
  name: seatStateLabels[id],
}))

const typeOptions = (Object.keys(seatTypeLabels) as SeatType[]).map((id) => ({
  id,
  name: seatTypeLabels[id],
}))

// Prevent an older request from replacing another theater's seats.
let loadVersion = 0

async function loadSeats() {
  const version = ++loadVersion
  const theaterId = props.theaterId

  loading.value = true
  error.value = ''

  try {
    const result = await getTheaterSeats(theaterId)

    if (version !== loadVersion) return
    seats.value = result
  } catch {
    if (version !== loadVersion) return
    error.value = 'No se pudieron cargar los asientos.'
  } finally {
    if (version === loadVersion) {
      loading.value = false
    }
  }
}

function reloadSeats() {
  message.value = ''
  void loadSeats()
}

async function saveStatus() {
  if (
    props.readonly ||
    props.disabled ||
    loading.value ||
    saving.value ||
    selectedSeats.value.length === 0 ||
    (selectedState.value === null && selectedType.value === null)
  ) {
    return
  }

  const theaterId = props.theaterId

  saving.value = true
  error.value = ''
  message.value = ''

  try {
    await updateSeatStatuses(theaterId, {
      seats: selectedSeats.value.map((seat) => ({
        rowNumber: seat.rowNumber,
        columnNumber: seat.columnNumber,
      })),
      ...(selectedState.value !== null ? { state: selectedState.value } : {}),
      ...(selectedType.value !== null ? { type: selectedType.value } : {}),
    })

    if (theaterId !== props.theaterId) return

    selectedSeats.value = []
    selectedState.value = null
    selectedType.value = null
    selectorVersion.value++

    await loadSeats()

    if (theaterId !== props.theaterId || error.value) return

    message.value = 'Asientos actualizados.'
  } catch (err) {
    if (theaterId !== props.theaterId) return

    const status = isAxiosError(err) ? err.response?.status : undefined
    const backendMessage =
      status && [400, 404, 409].includes(status) && isAxiosError(err)
        ? err.response?.data?.message
        : undefined

    error.value = Array.isArray(backendMessage)
      ? backendMessage.join(', ')
      : typeof backendMessage === 'string'
        ? backendMessage
        : 'No se pudieron actualizar los asientos.'
  } finally {
    saving.value = false
  }
}

watch(
  () => props.theaterId,
  () => {
    seats.value = []
    selectedSeats.value = []
    selectedState.value = null
    selectedType.value = null
    error.value = ''
    message.value = ''
    selectorVersion.value++

    void loadSeats()
  },
  { immediate: true },
)
</script>

<template>
  <section class="seat-editor" aria-label="Modificar estado de asientos">
    <h2>Estado de los asientos</h2>

    <LoadingState v-if="loading" message="Cargando asientos…" compact />

    <NotificationPopup
      v-if="error"
      type="error"
      :message="error"
      :duration="0"
      placement="bottom-right"
      @close="error = ''"
    />
    <NotificationPopup
      v-if="message"
      type="success"
      :message="message"
      placement="bottom-right"
      @close="message = ''"
    />

    <SeatSelector
      show-layout-diagnostics
      v-if="!loading && (!error || seats.length)"
      :key="selectorVersion"
      :theater-id="theaterId"
      :rows="rows"
      :columns="columns"
      :seats="seats"
      :max-selections="readonly ? 0 : 'all'"
      :selectable-states="selectableStates"
      :disabled="readonly || disabled || loading || saving"
      :readonly="readonly"
      @selection-change="selectedSeats = $event"
    />

    <div v-if="!readonly" class="seat-controls">
      <div class="seat-dropdowns">
        <SimpleDropdown
          v-model="selectedState"
          :options="stateOptions"
          label="Nuevo estado"
          placeholder="Seleccione un estado"
          :disabled="disabled || loading || saving"
        />

        <SimpleDropdown
          v-model="selectedType"
          :options="typeOptions"
          label="Nuevo tipo"
          placeholder="Seleccione un tipo"
          :disabled="disabled || loading || saving"
        />
      </div>
      <div class="seat-actions">
        <button type="button" :disabled="disabled || loading || saving" @click="reloadSeats">
          Actualizar asientos
        </button>

        <button
          class="save-button"
          type="button"
          :disabled="
            disabled ||
            loading ||
            saving ||
            selectedSeats.length === 0 ||
            (selectedState === null && selectedType === null)
          "
          @click="saveStatus"
        >
          {{ saving ? 'Guardando…' : 'Guardar cambios de asientos' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.seat-editor {
  margin-top: 24px;
  padding-top: 20px;
  padding-bottom: 24px;
  padding-left: 24px;
  padding-right: 24px;
  border-top: 1px solid var(--border-color);
}

button {
  cursor: pointer;
  min-height: 42px;
  padding: 9px 16px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
  font: inherit;
  color: var(--button-secondary-text);
  background: var(--button-secondary-background);
}

.save-button {
  color: var(--dialog-heading-text);
  background: var(--dialog-heading-background);
}

button:disabled {
  cursor: default;
  opacity: 0.6;
}

.seat-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  margin-top: 16px;
}

.seat-dropdowns {
  display: flex;
  flex: 1 1 320px;
  gap: 16px;
  min-width: 0;
}

.seat-dropdowns > * {
  flex: 1;
  min-width: 0;
}

.seat-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  margin-left: auto;
}

@media (max-width: 600px) {
  .seat-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .seat-dropdowns {
    flex: initial;
  }

  .seat-actions {
    margin-left: 0;
  }
}
</style>
