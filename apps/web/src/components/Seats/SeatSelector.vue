<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MovieSeat from './MovieSeat.vue';
import {
  seatKey,
  seatStateLabels,
  type Seat,
  type SeatSelectionLimit,
  type SeatState,
} from '@/types/seats.ts'

const props = withDefaults(
  defineProps<{
    theaterId: number
    rows: number
    columns: number
    seats: Seat[]
    maxSelections?: SeatSelectionLimit
    selectableStates?: SeatState[]
    disabled?: boolean
  }>(),
  {
    maxSelections: 'all',
    selectableStates: () => ['free'],
    disabled: false,
  },
)

const emit = defineEmits<{
  'selection-change': [seats: Seat[]]
}>()

const selectedKeys = ref<string[]>([])

const validDimensions = computed(() =>
  Number.isSafeInteger(props.rows) && props.rows > 0 &&
  Number.isSafeInteger(props.columns) && props.columns > 0 &&
  props.rows * props.columns <= 10_000,
)

const limit = computed(() => {
  if (props.maxSelections === 'all') return Infinity
  return Number.isSafeInteger(props.maxSelections)
    ? Math.max(0, props.maxSelections)
    : 0
})

// Missing positions are empty spaces, never fabricated free seats.
const seatMap = computed(() => {
  const map = new Map<string, Seat>()
  if (!validDimensions.value) return map

  for (const seat of props.seats) {
    if (
      seat.theaterId === props.theaterId &&
      Number.isInteger(seat.rowNumber) &&
      Number.isInteger(seat.columnNumber) &&
      seat.rowNumber >= 1 && seat.rowNumber <= props.rows &&
      seat.columnNumber >= 1 && seat.columnNumber <= props.columns
    ) {
      map.set(seatKey(seat), seat)
    }
  }
  return map
})

const selectedKeySet = computed(() => new Set(selectedKeys.value))

const selectedSeats = computed(() => selectedKeys.value
  .map(key => seatMap.value.get(key))
  .filter((seat): seat is Seat => seat !== undefined),
)

const gridRows = computed(() => {
  if (!validDimensions.value) return []

  return Array.from({ length: props.rows }, (_, rowIndex) => ({
    number: rowIndex + 1,
    cells: Array.from({ length: props.columns }, (_, columnIndex) => {
      const key = seatKey({
        theaterId: props.theaterId,
        rowNumber: rowIndex + 1,
        columnNumber: columnIndex + 1,
      })
      return { key, column: columnIndex + 1, seat: seatMap.value.get(key) }
    }),
  }))
})

const verticalAisles = computed(() => new Set(
  [Math.floor(props.columns / 3), Math.floor(2 * props.columns / 3)]
    .filter(column => column > 0 && column < props.columns),
))

const horizontalAisle = computed(() => Math.floor(props.rows / 2))

function canSelect(seat: Seat): boolean {
  return props.selectableStates.includes(seat.state)
}

function isSelected(seat: Seat): boolean {
  return selectedKeySet.value.has(seatKey(seat))
}

function isDisabled(seat: Seat): boolean {
  return props.disabled || !canSelect(seat) ||
    (!isSelected(seat) && selectedKeys.value.length >= limit.value)
}

function toggleSeat(seat: Seat) {
  if (isDisabled(seat)) return
  const key = seatKey(seat)
  selectedKeys.value = isSelected(seat)
    ? selectedKeys.value.filter(selectedKey => selectedKey !== key)
    : [...selectedKeys.value, key]
}

function clearSelection() {
  selectedKeys.value = []
}

function selectAll() {
  if (props.disabled || props.maxSelections !== 'all') return
  selectedKeys.value = Array.from(seatMap.value.values())
    .filter(canSelect)
    .map(seatKey)
}

// Reconcile selections after an API refresh, theater change, or limit change.
watch(
  [seatMap, limit, () => props.selectableStates],
  () => {
    const nextKeys = selectedKeys.value.filter(key => {
      const seat = seatMap.value.get(key)
      return seat !== undefined && canSelect(seat)
    }).slice(0, limit.value)

    if (nextKeys.length !== selectedKeys.value.length ||
        nextKeys.some((key, index) => key !== selectedKeys.value[index])) {
      selectedKeys.value = nextKeys
    }
  },
  { deep: true, flush: 'sync' },
)

// Emit copies so the consumer does not accidentally mutate seat props.
watch(
  selectedSeats,
  seats => emit('selection-change', seats.map(seat => ({ ...seat }))),
  { deep: true, immediate: true },
)

defineExpose({ clearSelection })
</script>

<template>
  <section class="seat-selector" :aria-label="`Asientos de la sala ${theaterId}`">
    <p v-if="!validDimensions" role="alert" class="message">
      Las dimensiones deben ser enteros positivos con un máximo de 10000 asientos.
    </p>

    <div v-else class="seat-scroll" tabindex="0" aria-label="Plano de asientos">
      <div class="theater">
        <div class="screen">PANTALLA</div>

        <div class="seat-matrix">
          <div
            v-for="row in gridRows"
            :key="row.number"
            class="seat-row"
            :class="{ 'horizontal-aisle': row.number === horizontalAisle && row.number < rows }"
            role="group"
            :aria-label="`Fila ${row.number}`"
          >
            <span class="row-label" aria-hidden="true">{{ row.number }}</span>

            <div
              v-for="cell in row.cells"
              :key="cell.key"
              class="seat-cell"
              :class="{ 'vertical-aisle': verticalAisles.has(cell.column) }"
            >
              <MovieSeat
                v-if="cell.seat"
                :seat="cell.seat"
                :selected="isSelected(cell.seat)"
                :disabled="isDisabled(cell.seat)"
                @toggle="toggleSeat"
              />
              <span v-else class="missing-seat" aria-hidden="true" />
            </div>
          </div>
        </div>

        <p v-if="seatMap.size === 0" class="message">No hay asientos registrados.</p>
      </div>
    </div>

    <div class="legend" aria-label="Estados de los asientos">
      <span v-for="(label, state) in seatStateLabels" :key="state">
        <i class="legend-dot" :class="`state-${state}`" aria-hidden="true" />
        {{ label }}
      </span>
      <span><i class="selected-sample" aria-hidden="true" />Seleccionado</span>
    </div>

    <p class="type-legend">
      Silla: normal · Silla con estrella: VIP · Silla de ruedas: accesibilidad
    </p>

    <div class="selection-summary">
      <span role="status" aria-live="polite">
        Seleccionados: {{ selectedKeys.length }}
        <template v-if="maxSelections !== 'all'"> / {{ limit }}</template>
      </span>
      <div class="actions">
        <button
          v-if="maxSelections === 'all'"
          type="button"
          :disabled="disabled || seatMap.size === 0"
          @click="selectAll"
        >Seleccionar todos</button>
        <button
          type="button"
          :disabled="disabled || selectedKeys.length === 0"
          @click="clearSelection"
        >Limpiar selección</button>
      </div>
    </div>
  </section>
</template>

<style scoped>


.seat-selector {
  box-sizing: border-box;
  width: 100%;
  --seat-width: 56px;
  --seat-height: 64px;
  --seat-gap: 14px;
  --aisle-size: 28px;
  min-width: 0;
  padding: 20px;
  color: #172033;
  background: #fff;
  border: 1px solid #dce2eb;
  border-radius: 12px;
}
.seat-scroll {
  box-sizing: border-box;
  width: 100%;
  overflow-x: auto;
  padding: 12px 10px 20px;
}
.seat-scroll:focus-visible { outline: 2px solid #2563eb; }
.theater { width: max-content; min-width: 100%; }
.screen {
  margin: 0 0 60px;
  padding: 10px;
  color: #475569;
  background: #e8edf5;
  border-top: 5px solid #94a3b8;
  border-radius: 50% 50% 6px 6px;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.2em;
}
.seat-matrix {
  display: flex;
  flex-direction: column;
  gap: var(--seat-gap);
  width: max-content;
  margin: auto;
}
.seat-row { display: flex; align-items: center; gap: var(--seat-gap); }
.row-label { width: 24px; flex-shrink: 0; color: #64748b; text-align: center; font-size: 0.8rem; }
.seat-cell { width: var(--seat-width); flex-shrink: 0; }
.missing-seat { display: block; width: var(--seat-width); height: var(--seat-height); }
.vertical-aisle { margin-right: var(--aisle-size); }
.horizontal-aisle { margin-bottom: var(--aisle-size); }
.legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 16px; font-size: 0.85rem; }
.legend > span { display: inline-flex; align-items: center; gap: 6px; }
.legend-dot, .selected-sample { width: 12px; height: 12px; border: 1px solid currentColor; border-radius: 3px; }
.state-free { color: #166534; background: #dcfce7; }
.state-unavailable { color: #475569; background: #e2e8f0; }
.state-in-use { color: #991b1b; background: #fee2e2; }
.state-reserved { color: #854d0e; background: #fef3c7; }
.selected-sample { color: #2563eb; background: #dbeafe; }
.type-legend, .message { color: #64748b; text-align: center; font-size: 0.85rem; }
.selection-summary { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-top: 20px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.actions button { padding: 8px 12px; color: #172033; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font: inherit; cursor: pointer; }
.actions button:disabled { opacity: 0.5; cursor: not-allowed; }
.actions button:focus-visible { outline: 3px solid #2563eb; outline-offset: 3px; }
</style>
