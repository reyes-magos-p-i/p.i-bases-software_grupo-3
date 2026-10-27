<script setup lang="ts">
import { onMounted, ref, useTemplateRef, watch } from 'vue'
import TheaterDialogShell from './TheaterDialogShell.vue'
import SeatSelector from '../Seats/SeatSelector.vue'
import { getTheaterSeats } from '@/services/theater.service'
import type { Theater } from '@/types/theater'
import type { Seat } from '@/types/seats'

const props = withDefaults(
  defineProps<{ theater: Theater | null; error?: string }>(),
  { error: '' },
)

const emit = defineEmits<{ close: [] }>()
const shell = useTemplateRef('shell')

const seats = ref<Seat[]>([])
const selectedSeats = ref<Seat[]>([])
const loadingSeats = ref(false)
const seatsError = ref('')

function syncDialog() {
  if (props.theater || props.error) shell.value?.open()
  else shell.value?.close()
}

function handleSelection(selection: Seat[]) {
  selectedSeats.value = selection
}

function closeDialog() {
  shell.value?.close()
  emit('close')
}

onMounted(syncDialog)

watch(
  () => [props.theater, props.error],
  syncDialog,
  { flush: 'post' },
)

watch(
  () => props.theater?.theaterId,
  async (theaterId, _, onCleanup) => {
    seats.value = []
    selectedSeats.value = []
    seatsError.value = ''
    loadingSeats.value = false

    if (theaterId === undefined) return

    const controller = new AbortController()
    onCleanup(() => controller.abort())

    loadingSeats.value = true

    try {
      const result = await getTheaterSeats(theaterId, controller.signal)

      if (!controller.signal.aborted) {
        seats.value = result
      }
    } catch {
      if (!controller.signal.aborted) {
        seatsError.value = 'No se pudieron cargar los asientos.'
      }
    } finally {
      if (!controller.signal.aborted) {
        loadingSeats.value = false
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <TheaterDialogShell ref="shell" title="Detalle de sala" close-label="Cerrar" @close="emit('close')">
    <div v-if="theater || error" class="theater-detail-content">
      <p v-if="!theater" class="detail-error" role="alert">{{ error }}</p>
      <div v-else class="detail-grid">
        <div class="readonly-field"><label>ID</label><div class="readonly-input">{{ theater.theaterId }}</div></div>
        <div class="readonly-field"><label>Sucursal</label><div class="readonly-input">{{ theater.cinema }}</div></div>
        <div class="readonly-field"><label>Número de asientos</label><div class="readonly-input">{{ theater.numberOfSeats }}</div></div>
        <div class="dimension-grid">
          <div class="readonly-field"><label>Filas</label><div class="readonly-input">{{ theater.dimensionX }}</div></div>
          <div class="readonly-field"><label>Columnas</label><div class="readonly-input">{{ theater.dimensionY }}</div></div>
        </div>
        <div class="readonly-field"><label>Proyector</label><div class="readonly-input">{{ theater.projectorName }}</div></div>
        <div class="readonly-field"><label>Estado</label><div class="readonly-input">{{ theater.isActive ? theater.status : 'Inactiva' }}</div></div>
      </div>
      <footer class="dialog-actions">
        <button
          type="button"
          class="secondary-button"
          @click="closeDialog"
        >
          Cerrar
        </button>
      </footer>
      <section v-if="theater" class="theater-seats">
  <h3>Asientos de la sala</h3>

  <p v-if="loadingSeats" role="status">
    Cargando asientos...
  </p>

  <p v-else-if="seatsError" class="detail-error" role="alert">
    {{ seatsError }}
  </p>

  <template v-else>
    <SeatSelector
      :key="theater.theaterId"
      :theater-id="theater.theaterId"
      :rows="theater.dimensionX"
      :columns="theater.dimensionY"
      :seats="seats"
      max-selections="all"
      :selectable-states="['free', 'unavailable', 'in-use', 'reserved']"
      @selection-change="handleSelection"
    />

    <p v-if="selectedSeats.length">
      Selección:
      {{
        selectedSeats
          .map(seat => `${seat.rowNumber}-${seat.columnNumber}`)
          .join(', ')
      }}
    </p>
  </template>
</section>
    </div>

  </TheaterDialogShell>
</template>

<style scoped>
.theater-seats {
  min-width: 0;
  margin-top: 24px;
}

.theater-seats h3 {
  margin-bottom: 16px;
}

.theater-detail-content {
  display: grid;
  gap: 8px;
  padding: 24px;
  overflow-y: auto;
  font: inherit;
}
.detail-error {
  margin: 0;
  color: var(--color-error);
}
.detail-grid {
  display: grid;
  gap: 8px;
}
.dimension-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 8px;
}
.readonly-field {
  display: grid;
  gap: 8px;
}
.readonly-input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  font: inherit;
  background: var(--content-background);
  color: var(--text-primary);
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
.secondary-button {
  min-height: 42px;
  padding: 9px 16px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  color: var(--text-primary);
  background: var(--content-background);
  font: inherit;
}
@media (max-width: 520px) {
  .dimension-grid {
    grid-template-columns: 1fr;
  }
}
</style>
