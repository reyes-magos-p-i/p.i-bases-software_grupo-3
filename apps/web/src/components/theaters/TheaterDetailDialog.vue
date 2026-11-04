<script setup lang="ts">
import LoadingState from '@/components/common/LoadingState.vue'
import { onMounted, ref, useTemplateRef, watch } from 'vue'
import TheaterDialogShell from './TheaterDialogShell.vue'
import SeatSelector from '../Seats/SeatSelector.vue'
import { getTheaterSeats } from '@/services/theater.service'
import type { Theater } from '@/types/theater'
import type { Seat } from '@/types/seats'

const props = withDefaults(defineProps<{ theater: Theater | null; error?: string }>(), {
  error: '',
})

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

watch(() => [props.theater, props.error], syncDialog, { flush: 'post' })

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
  <TheaterDialogShell
    ref="shell"
    title="Detalle de sala"
    close-label="Cerrar"
    width="1100px"
    @close="emit('close')"
  >
    <div v-if="theater || error" class="theater-detail-content">
      <p v-if="!theater" class="detail-error" role="alert">{{ error }}</p>
      <section v-else class="detail-group">
        <h3>Información de la sala</h3>
        <dl class="detail-grid">
          <div>
            <dt>ID</dt>
            <dd>{{ theater.theaterId }}</dd>
          </div>
          <div>
            <dt>Sucursal</dt>
            <dd>{{ theater.cinema }}</dd>
          </div>
          <div>
            <dt>Número de asientos</dt>
            <dd>{{ theater.numberOfSeats }}</dd>
          </div>
          <div>
            <dt>Filas</dt>
            <dd>{{ theater.dimensionX }}</dd>
          </div>
          <div>
            <dt>Columnas</dt>
            <dd>{{ theater.dimensionY }}</dd>
          </div>
          <div>
            <dt>Proyector</dt>
            <dd>{{ theater.projectorName }}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{{ theater.isActive ? theater.status : 'Inactiva' }}</dd>
          </div>
        </dl>
      </section>
      <section v-if="theater" class="theater-seats detail-group">
        <h3>Asientos de la sala</h3>

        <LoadingState v-if="loadingSeats" message="Cargando asientos..." compact />

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
            disabled
            readonly
            show-layout-diagnostics
            :selectable-states="['free', 'unavailable', 'in-use', 'reserved']"
            @selection-change="handleSelection"
          />

          <p v-if="selectedSeats.length">
            Selección:
            {{ selectedSeats.map((seat) => `${seat.rowNumber}-${seat.columnNumber}`).join(', ') }}
          </p>
        </template>
      </section>
      <footer class="dialog-actions">
        <button type="button" class="secondary-button" @click="closeDialog">Cerrar</button>
      </footer>
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
  padding: var(--dialog-content-padding);
  overflow-y: auto;
  font: inherit;
}
.detail-error {
  margin: 0;
  color: var(--color-error);
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
</style>
