<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { dateParts, todayInCostaRica, validDate } from '@/utils/date-only'

defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    modelValue?: string
    min?: string
    max?: string
    required?: boolean
    disabled?: boolean
  }>(),
  { modelValue: '', min: '', max: '', required: false, disabled: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const id = useId()
const root = ref<HTMLElement>()
const input = ref<HTMLInputElement>()
const panel = ref<HTMLElement>()
const open = ref(false)
const choosingYear = ref(false)
const focusedDate = ref('')
const initial = todayInCostaRica()
const year = ref(Number(initial.slice(0, 4)))
const month = ref(Number(initial.slice(5, 7)))
const yearStart = ref(1)
const months = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('es-CR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, index)),
  ),
)
const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const years = computed(() =>
  Array.from({ length: 12 }, (_, i) => yearStart.value + i).filter((value) => value <= 9999),
)
const formatted = computed(() =>
  validDate(props.modelValue) ? props.modelValue.split('-').reverse().join('/') : '',
)
const cells = computed(() => {
  const first = new Date(dateParts(year.value, month.value, 1) + 'T00:00:00Z')
  const offset = (first.getUTCDay() + 6) % 7
  const last = new Date(first)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  return Array.from({ length: Math.ceil((offset + last.getUTCDate()) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1
    return day > 0 && day <= last.getUTCDate() ? dateParts(year.value, month.value, day) : ''
  })
})
const tabDate = computed(() =>
  [focusedDate.value, props.modelValue, ...cells.value].find(
    (value) => value && cells.value.includes(value) && allowed(value),
  ),
)
function allowed(value: string) {
  return (!props.min || value >= props.min) && (!props.max || value <= props.max)
}
async function focusDay(value?: string) {
  await nextTick()
  const selected = value
    ? panel.value?.querySelector<HTMLButtonElement>(`[data-date="${value}"]:not(:disabled)`)
    : undefined
  ;(
    selected ?? panel.value?.querySelector<HTMLButtonElement>('[data-date]:not(:disabled)')
  )?.focus()
}
async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (!open.value) return
  let value = validDate(props.modelValue) ? props.modelValue : todayInCostaRica()
  if (props.max && value > props.max) value = props.max
  if (props.min && value < props.min) value = props.min
  year.value = Number(value.slice(0, 4))
  month.value = Number(value.slice(5, 7))
  choosingYear.value = false
  await focusDay(value)
}
function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) input.value?.focus()
}
function escape(event: KeyboardEvent) {
  if (!open.value) return
  event.preventDefault()
  event.stopPropagation()
  close(true)
}
async function select(value: string) {
  emit('update:modelValue', value)
  close(true)
  await nextTick()
  input.value?.dispatchEvent(new Event('change', { bubbles: true }))
}
function move(amount: number) {
  if (choosingYear.value) {
    yearStart.value = Math.max(1, Math.min(9988, yearStart.value + amount * 12))
    return
  }
  const index = (year.value - 1) * 12 + month.value - 1 + amount
  if (index < 0 || index >= 9999 * 12) return
  year.value = Math.floor(index / 12) + 1
  month.value = (index % 12) + 1
}
function chooseYear() {
  choosingYear.value = !choosingYear.value
  yearStart.value = Math.max(1, Math.min(9988, year.value - 5))
}
function setYear(value: number) {
  year.value = value
  choosingYear.value = false
  void focusDay()
}
function keyboard(event: KeyboardEvent, value: string) {
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  }
  if (!(event.key in offsets)) return
  event.preventDefault()
  const date = new Date(value + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + offsets[event.key]!)
  const next = date.toISOString().slice(0, 10)
  if (!validDate(next) || !allowed(next)) return
  year.value = date.getUTCFullYear()
  month.value = date.getUTCMonth() + 1
  void focusDay(next)
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}
function leave(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) close()
}
watch(
  () => props.disabled,
  (value) => {
    if (value) close()
  },
)
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <div ref="root" class="date-picker" @focusout="leave" @keydown.esc="escape">
    <div class="date-control">
      <input
        v-bind="$attrs"
        ref="input"
        :value="formatted"
        type="text"
        readonly
        :disabled="disabled"
        :required="required"
        placeholder="Selecciona una fecha"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :aria-controls="id"
        @click="toggle"
        @keydown.enter.prevent="toggle"
        @keydown.space.prevent="toggle"
        @keydown.down.prevent="toggle"
      />
      <i class="bi bi-calendar3" aria-hidden="true" />
    </div>
    <Transition name="calendar">
      <div
        v-if="open"
        :id="id"
        ref="panel"
        class="calendar-panel"
        role="dialog"
        aria-label="Seleccionar fecha"
      >
        <div class="calendar-heading">
          <button type="button" aria-label="Anterior" @click="move(-1)">
            <i class="bi bi-chevron-left" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="year-toggle"
            :aria-expanded="choosingYear"
            @click="chooseYear"
          >
            {{ choosingYear ? `${yearStart}–${Math.min(yearStart + 11, 9999)}` : year }}
          </button>
          <button type="button" aria-label="Siguiente" @click="move(1)">
            <i class="bi bi-chevron-right" aria-hidden="true" />
          </button>
        </div>
        <div v-if="choosingYear" class="year-grid">
          <button
            v-for="value in years"
            :key="value"
            type="button"
            :aria-pressed="value === year"
            @click="setYear(value)"
          >
            {{ value }}
          </button>
        </div>
        <template v-else>
          <label :for="id + '-month'" class="visually-hidden">Mes</label>
          <select :id="id + '-month'" v-model.number="month" class="month-select">
            <option v-for="(label, index) in months" :key="label" :value="index + 1">
              {{ label }}
            </option>
          </select>
          <div class="day-grid" aria-label="Días del mes">
            <span
              v-for="(day, index) in weekdays"
              :key="index"
              class="weekday"
              aria-hidden="true"
              >{{ day }}</span
            >
            <template v-for="(value, index) in cells" :key="index">
              <button
                v-if="value"
                type="button"
                :data-date="value"
                :disabled="!allowed(value)"
                :tabindex="value === tabDate ? 0 : -1"
                @focus="focusedDate = value"
                :aria-label="value.split('-').reverse().join('/')"
                :aria-pressed="value === modelValue"
                :aria-current="value === initial ? 'date' : undefined"
                @click="select(value)"
                @keydown="keyboard($event, value)"
              >
                {{ Number(value.slice(8)) }}
              </button>
              <span v-else />
            </template>
          </div>
        </template>
        <div class="calendar-footer">
          <button v-if="!required" type="button" @click="select('')">Limpiar</button>
          <button type="button" @click="close(true)">Cerrar</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.date-picker {
  position: relative;
  min-width: 0;
}
.date-control {
  position: relative;
}
.date-control input {
  width: 100%;
  min-height: 44px;
  padding: 10px 40px 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  color: var(--text-primary);
  background: var(--input-background);
  cursor: pointer;
}
.date-control input:focus-visible,
button:focus-visible,
select:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
.date-control input[aria-invalid='true'] {
  border-color: var(--error-color);
}
.date-control i {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--text-secondary);
}
.calendar-panel {
  position: absolute;
  inset: calc(100% + 8px) auto auto 0;
  z-index: 10;
  width: min(300px, calc(100vw - 4rem));
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-medium);
  color: var(--text-primary);
  background: var(--content-background);
  box-shadow: 0 8px 24px var(--shadow-strong-color);
}
.calendar-heading,
.calendar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
button {
  min-width: 32px;
  min-height: 36px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--radius-small);
  color: var(--text-primary);
  background: transparent;
}
button:hover:not(:disabled) {
  background: var(--surface-hover);
}
button:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
}
button[aria-pressed='true'] {
  color: var(--button-confirm-text);
  background: var(--button-confirm-background);
}
.year-toggle {
  font-weight: 700;
}
.month-select {
  width: 100%;
  margin: 8px 0;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  color: var(--text-primary);
  background: var(--input-background);
}
.day-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}
.weekday {
  padding: 6px 0;
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.year-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 8px 0;
}
.calendar-footer {
  margin-top: 8px;
  border-top: 1px solid var(--border-color);
}
.calendar-enter-active,
.calendar-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
}
.calendar-enter-from,
.calendar-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .calendar-enter-active,
  .calendar-leave-active {
    transition: none;
  }
}
</style>
