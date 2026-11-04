<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MovieSeat from './MovieSeat.vue'
import {
  seatKey,
  seatStateLabels,
  seatStateIcons,
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
    readonly?: boolean
    showLayoutDiagnostics?: boolean
  }>(),
  {
    maxSelections: 'all',
    selectableStates: () => ['free'],
    disabled: false,
    readonly: false,
    showLayoutDiagnostics: false,
  },
)

const emit = defineEmits<{
  'selection-change': [seats: Seat[]]
}>()

const selectedKeys = ref<string[]>([])

const validDimensions = computed(
  () =>
    Number.isSafeInteger(props.rows) &&
    props.rows > 0 &&
    Number.isSafeInteger(props.columns) &&
    props.columns > 0 &&
    props.rows * props.columns <= 10_000,
)

const limit = computed(() => {
  if (props.maxSelections === 'all') return Infinity
  return Number.isSafeInteger(props.maxSelections) ? Math.max(0, props.maxSelections) : 0
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
      seat.rowNumber >= 1 &&
      seat.rowNumber <= props.rows &&
      seat.columnNumber >= 1 &&
      seat.columnNumber <= props.columns
    ) {
      map.set(seatKey(seat), seat)
    }
  }
  return map
})

const selectedKeySet = computed(() => new Set(selectedKeys.value))
const selectableSeats = computed(() => Array.from(seatMap.value.values()).filter(canSelect))

const selectedSeats = computed(() =>
  selectedKeys.value
    .map((key) => seatMap.value.get(key))
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
const visibleRows = computed(() =>
  props.showLayoutDiagnostics
    ? gridRows.value
    : gridRows.value.filter((row) => row.cells.some((cell) => cell.seat)),
)

const verticalAisles = computed(
  () =>
    new Set(
      [Math.floor(props.columns / 3), Math.floor((2 * props.columns) / 3)].filter(
        (column) => column > 0 && column < props.columns,
      ),
    ),
)

const horizontalAisle = computed(() => Math.floor(props.rows / 2))

function canSelect(seat: Seat): boolean {
  return props.selectableStates.includes(seat.state)
}

function isSelected(seat: Seat): boolean {
  return selectedKeySet.value.has(seatKey(seat))
}

function isDisabled(seat: Seat): boolean {
  return (
    props.readonly ||
    props.disabled ||
    !canSelect(seat) ||
    (!isSelected(seat) && selectedKeys.value.length >= limit.value)
  )
}

function toggleSeat(seat: Seat) {
  if (isDisabled(seat)) return
  const key = seatKey(seat)
  selectedKeys.value = isSelected(seat)
    ? selectedKeys.value.filter((selectedKey) => selectedKey !== key)
    : [...selectedKeys.value, key]
}

function clearSelection() {
  if (props.disabled || props.readonly) return
  selectedKeys.value = []
}

function selectAll() {
  if (props.disabled || props.readonly || props.maxSelections !== 'all') return
  selectedKeys.value = selectableSeats.value.map(seatKey)
}

// Reconcile selections after an API refresh, theater change, or limit change.
watch(
  [seatMap, limit, () => props.selectableStates],
  () => {
    const nextKeys = selectedKeys.value
      .filter((key) => {
        const seat = seatMap.value.get(key)
        return seat !== undefined && canSelect(seat)
      })
      .slice(0, limit.value)

    if (
      nextKeys.length !== selectedKeys.value.length ||
      nextKeys.some((key, index) => key !== selectedKeys.value[index])
    ) {
      selectedKeys.value = nextKeys
    }
  },
  { deep: true, flush: 'sync' },
)

// Emit copies so the consumer does not accidentally mutate seat props.
watch(
  selectedSeats,
  (seats) =>
    emit(
      'selection-change',
      seats.map((seat) => ({ ...seat })),
    ),
  { deep: true, immediate: true },
)

defineExpose({ clearSelection })
</script>

<template>
  <section class="seat-selector" :aria-label="`Asientos de la sala ${theaterId}`">
    <p v-if="!validDimensions" role="alert" class="message">
      Las dimensiones deben ser enteros positivos con un máximo de 10000 asientos.
    </p>

    <p v-else-if="seatMap.size === 0" class="message" role="status">
      {{ showLayoutDiagnostics ? 'No hay asientos registrados.' : 'No hay asientos disponibles.' }}
    </p>
    <template v-else>
      <div class="screen">PANTALLA</div>
      <div class="seat-scroll" tabindex="0" aria-label="Plano de asientos">
        <div class="theater">
          <div class="seat-matrix">
            <div
              v-for="row in visibleRows"
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
              <span
                v-if="showLayoutDiagnostics && !row.cells.some((cell) => cell.seat)"
                class="empty-row"
                >Sin asientos registrados</span
              >
            </div>
          </div>
        </div>
      </div>
    </template>

    <div class="legend" aria-label="Estados de los asientos">
      <span v-for="(label, state) in seatStateLabels" :key="state">
        <i
          class="legend-dot bi"
          :class="[`state-${state}`, seatStateIcons[state]]"
          aria-hidden="true"
        />
        {{ label }}
      </span>
      <span><i class="selected-sample" aria-hidden="true" />Seleccionado</span>
    </div>

    <p class="type-legend">
      Silla: normal · Silla con estrella: VIP · Silla de ruedas: accesibilidad
    </p>

    <p
      v-if="
        showLayoutDiagnostics && validDimensions && seatMap.size && seatMap.size !== rows * columns
      "
      class="message"
      role="status"
    >
      El plano contiene posiciones sin asientos registrados. Solo se muestran los asientos
      existentes.
    </p>
    <div v-if="!readonly" class="selection-summary">
      <span role="status" aria-live="polite">
        Seleccionados: {{ selectedKeys.length }}
        <template v-if="maxSelections !== 'all'"> / {{ limit }}</template>
      </span>
      <div class="actions">
        <button
          v-if="maxSelections === 'all'"
          type="button"
          :disabled="disabled || !selectableSeats.length"
          @click="selectAll"
        >
          Seleccionar todos
        </button>
        <button
          type="button"
          :disabled="disabled || selectedKeys.length === 0"
          @click="clearSelection"
        >
          Limpiar selección
        </button>
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
  color: var(--text-primary);
  background: var(--content-background);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}
.seat-scroll {
  box-sizing: border-box;
  width: 100%;
  overflow-x: auto;
  max-height: min(60dvh, 640px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 10px 20px;
}
.seat-scroll:focus-visible {
  outline: 2px solid var(--focus-color);
}
.theater {
  width: max-content;
  min-width: 100%;
}
.screen {
  margin: 0 0 24px;
  padding: 10px;
  color: var(--text-secondary);
  background: var(--surface-hover);
  border-top: 5px solid var(--border-strong);
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
.seat-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--seat-gap);
}
.row-label {
  position: sticky;
  left: 0;
  z-index: 1;
  align-self: stretch;
  display: grid;
  place-items: center;
  background: var(--content-background);
  width: 24px;
  flex-shrink: 0;
  color: var(--text-secondary);
  text-align: center;
  font-size: 0.8rem;
}
.seat-cell {
  width: var(--seat-width);
  flex-shrink: 0;
}
.missing-seat {
  display: block;
  width: var(--seat-width);
  height: var(--seat-height);
}
.vertical-aisle {
  margin-right: var(--aisle-size);
}
.horizontal-aisle {
  margin-bottom: var(--aisle-size);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
  font-size: 0.85rem;
}
.legend > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend-dot,
.selected-sample {
  width: 12px;
  height: 12px;
  border: 1px solid currentColor;
  border-radius: 3px;
}
.legend-dot {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
}
.empty-row {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.empty-row {
  position: absolute;
  left: 40px;
}
.state-free {
  color: var(--success-text);
  background: var(--success-background);
}
.state-unavailable {
  color: var(--text-secondary);
  background: var(--input-disabled-background);
}
.state-in-use {
  color: var(--error-text);
  background: var(--error-background);
}
.state-reserved {
  color: var(--warning-text);
  background: var(--warning-background);
}
.selected-sample {
  color: var(--accent-color);
  background: var(--surface-hover);
}
.type-legend,
.message {
  color: var(--text-secondary);
  text-align: center;
  font-size: 0.85rem;
}
.selection-summary {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.actions button {
  padding: 8px 12px;
  color: var(--text-primary);
  background: var(--button-secondary-background);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.actions button:focus-visible {
  outline: 3px solid var(--focus-color);
  outline-offset: 3px;
}
@media (max-width: 576px) {
  .seat-selector {
    padding: 12px;
    --seat-width: 48px;
    --seat-height: 60px;
    --seat-gap: 12px;
    --aisle-size: 20px;
  }
  .screen {
    margin-bottom: 16px;
  }
}
</style>
