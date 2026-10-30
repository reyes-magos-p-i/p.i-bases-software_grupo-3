<script setup lang="ts">
import { ref, watch } from 'vue'
import SeatSelector from '../Seats/SeatSelector.vue'
import {
  getTheaterSeats,
  updateSeatStatuses,
} from '@/services/theater.service'
import type { Seat, SeatState } from '@/types/seats.ts';

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
const selectedState = ref<SeatState | ''>('')

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const selectorVersion = ref(0)

const selectableStates: SeatState[] = [
  'free',
  'unavailable',
  'in-use',
  'reserved',
]

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

async function saveStatus() {
  if (
    props.readonly ||
    props.disabled ||
    loading.value ||
    saving.value ||
    selectedSeats.value.length === 0 ||
    selectedState.value === ''
  ) {
    return
  }

  const theaterId = props.theaterId

  saving.value = true
  error.value = ''
  message.value = ''

  try {
    await updateSeatStatuses(theaterId, {
      seats: selectedSeats.value.map(seat => ({
        rowNumber: seat.rowNumber,
        columnNumber: seat.columnNumber,
      })),
      state: selectedState.value,
    })

    if (theaterId !== props.theaterId) return

    selectedSeats.value = []
    selectedState.value = ''
    selectorVersion.value++

    await loadSeats()

    message.value = 'Estado de los asientos actualizado.'
  } catch {
    if (theaterId === props.theaterId) {
      error.value = 'No se pudo actualizar el estado de los asientos.'
    }
  } finally {
    saving.value = false
  }
}

watch(
  () => props.theaterId,
  () => {
    seats.value = []
    selectedSeats.value = []
    selectedState.value = ''
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

    <p v-if="loading" role="status">
      Cargando asientos…
    </p>

    <p v-if="error" role="alert">
      {{ error }}
    </p>

    <p v-if="message" role="status">
      {{ message }}
    </p>

    <button
      type="button"
      :disabled="disabled || loading || saving"
      @click="message = ''; loadSeats()"
    >
      Actualizar asientos
    </button>
    <pre>
      readonly: {{ readonly }}
      disabled: {{ disabled }}
      loading: {{ loading }}
      saving: {{ saving }}
      first seat state: {{ seats[0]?.state }}
      selected seats: {{ selectedSeats.length }}
      </pre>
    <SeatSelector
      :key="selectorVersion"
      :theater-id="theaterId"
      :rows="rows"
      :columns="columns"
      :seats="seats"
      :max-selections= "readonly ? 0 : 'all'"
      :selectable-states="selectableStates"
      :disabled="readonly || disabled || loading || saving"
      @selection-change="selectedSeats = $event"
    />

    <div  v-if="!readonly" class="seat-controls">
      <label>
        Nuevo estado

        <select
          v-model="selectedState"
          :disabled="disabled || loading || saving"
        >
          <option disabled value="">Seleccione un estado</option>
          <option value="free">Libre</option>
          <option value="unavailable">No disponible</option>
          <option value="in-use">En uso</option>
          <option value="reserved">Reservado</option>
        </select>
      </label>

      <button
        type="button"
        :disabled="
          disabled ||
          loading ||
          saving ||
          selectedSeats.length === 0 ||
          selectedState === ''
        "
        @click="saveStatus"
      >
        {{ saving ? 'Guardando…' : 'Guardar estado de asientos' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.seat-editor {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #ddd;
}

.seat-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin-top: 16px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

select,
button {
  padding: 8px 12px;
  font: inherit;
  border: 1px solid #ccc;
  border-radius: 6px;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.6;
}
</style>
