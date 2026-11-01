<script setup lang="ts">
import { computed } from 'vue'
import {
  seatStateLabels,
  seatTypeLabels,
  type Seat,
} from '@/types/seats'

const props = withDefaults(
  defineProps<{
    seat: Seat
    selected?: boolean
    disabled?: boolean
  }>(),
  { selected: false, disabled: false },
)

const emit = defineEmits<{
  toggle: [seat: Seat]
}>()

const seatNumber = computed(
  () => `${props.seat.rowNumber}-${props.seat.columnNumber}`,
)

const accessibleLabel = computed(() => [
  `Sala ${props.seat.theaterId}`,
  `Fila ${props.seat.rowNumber}, columna ${props.seat.columnNumber}`,
  seatTypeLabels[props.seat.type],
  seatStateLabels[props.seat.state],
].join(', '))

function handleClick() {
  if (!props.disabled) emit('toggle', { ...props.seat })
}
</script>

<template>
  <button
    type="button"
    class="seat"
    :class="[
      `seat--${seat.type}`,
      `seat--${seat.state}`,
      { 'seat--selected': selected },
    ]"
    :disabled="disabled"
    :aria-label="accessibleLabel"
    :aria-pressed="selected"
    :title="accessibleLabel"
    @click="handleClick"
  >
    <svg
      v-if="seat.type === 'accessibility'"
      class="seat-icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="17" cy="5" r="2" fill="currentColor" stroke="none" />
      <path d="M16 10v9h8l4 8M16 14h7" />
      <path d="M12 13a8 8 0 1 0 9 12" />
    </svg>

    <svg
      v-else
      class="seat-icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="4" width="18" height="17" rx="4" />
      <path d="M4 14v11h24V14M8 25v4M24 25v4" />
      <path
        v-if="seat.type === 'vip'"
        d="m16 7 1.5 3 3.5.5-2.5 2.5.6 3.5-3.1-1.6-3.1 1.6.6-3.5-2.5-2.5 3.5-.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>

    <span class="seat-number" aria-hidden="true">{{ seatNumber }}</span>
    <span v-if="selected" class="selection-mark" aria-hidden="true">✓</span>
  </button>
</template>

<style scoped>
.seat {
  box-sizing: border-box;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: var(--seat-width, 56px);
  height: var(--seat-height, 64px);
  flex-shrink: 0;
  padding: 5px;
  font: inherit;
  border: 2px solid currentColor;
  cursor: pointer;
}
.seat--normal { border-radius: 8px; }
.seat--vip { border-width: 3px; border-radius: 14px 14px 6px 6px; }
.seat--accessibility { border-style: dashed; border-radius: 8px; }
.seat--free { color: #166534; background: #dcfce7; }
.seat--unavailable { color: #475569; background: #e2e8f0; }
.seat--in-use { color: #991b1b; background: #fee2e2; }
.seat--reserved { color: #854d0e; background: #fef3c7; }
.seat-icon { width: 30px; height: 30px; flex-shrink: 0; }
.seat-number { font-size: 11px; font-weight: 600; line-height: 14px; }
.seat--selected { box-shadow: 0 0 0 2px #fff, 0 0 0 5px #2563eb; }
.selection-mark {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 19px;
  height: 19px;
  color: #fff;
  background: #2563eb;
  border-radius: 50%;
  font-size: 12px;
  line-height: 19px;
  text-align: center;
}
.seat:not(:disabled):hover { filter: brightness(0.94); }
.seat:focus-visible { outline: 3px solid #0f172a; outline-offset: 6px; }
.seat:disabled { cursor: not-allowed; }
</style>
