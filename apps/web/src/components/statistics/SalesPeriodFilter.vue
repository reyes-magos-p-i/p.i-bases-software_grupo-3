<script setup lang="ts">
import { ref } from 'vue'
import DatePicker from '@/components/common/DatePicker.vue'
import {
  STATISTICS_PERIODS,
  statisticsPeriod,
  statisticsPeriodError,
  type StatisticsPeriod,
} from '@/utils/statistics-period'

const emit = defineEmits<{ apply: [period: { dateFrom: string; dateTo: string }] }>()
const props = withDefaults(
  defineProps<{
    initialPeriod?: { dateFrom: string; dateTo: string }
    idPrefix?: string
    autoApply?: boolean
    alwaysShowSubmit?: boolean
    disabled?: boolean
    surface?: 'light' | 'dark'
  }>(),
  { idPrefix: 'sales', autoApply: true, alwaysShowSubmit: false, disabled: false, surface: 'dark' },
)
const initial = props.initialPeriod ?? statisticsPeriod('last30days')
const preset = ref<StatisticsPeriod>(props.initialPeriod ? 'custom' : 'last30days')
const dateFrom = ref(initial.dateFrom)
const dateTo = ref(initial.dateTo)
const error = ref('')

function apply() {
  if (props.disabled) return
  error.value = statisticsPeriodError(dateFrom.value, dateTo.value)
  if (!error.value) emit('apply', { dateFrom: dateFrom.value, dateTo: dateTo.value })
}
function changePreset() {
  error.value = ''
  if (preset.value === 'custom') return
  const period = statisticsPeriod(preset.value)
  dateFrom.value = period.dateFrom
  dateTo.value = period.dateTo
  if (props.autoApply) apply()
}
</script>

<template>
  <form
    class="period-filter"
    :class="{ 'period-filter--light': surface === 'light' }"
    novalidate
    @submit.prevent="apply"
  >
    <div class="period-field">
      <label :for="idPrefix + '-period'">Periodo</label>
      <select
        :id="idPrefix + '-period'"
        v-model="preset"
        :disabled="disabled"
        @change="changePreset"
      >
        <option v-for="period in STATISTICS_PERIODS" :key="period.value" :value="period.value">
          {{ period.label }}
        </option>
      </select>
    </div>
    <template v-if="preset === 'custom'">
      <div class="period-field">
        <label :for="idPrefix + '-date-from'">Desde</label>
        <DatePicker
          :id="idPrefix + '-date-from'"
          v-model="dateFrom"
          required
          :disabled="disabled"
          :aria-invalid="!!error"
          :aria-describedby="error ? idPrefix + '-period-error' : undefined"
        />
      </div>
      <div class="period-field">
        <label :for="idPrefix + '-date-to'">Hasta</label>
        <DatePicker
          :id="idPrefix + '-date-to'"
          v-model="dateTo"
          required
          :disabled="disabled"
          :aria-invalid="!!error"
          :aria-describedby="error ? idPrefix + '-period-error' : undefined"
        />
      </div>
    </template>
    <p v-if="error" :id="idPrefix + '-period-error'" class="filter-error" role="alert">
      {{ error }}
    </p>
    <slot name="options" />
    <slot v-if="alwaysShowSubmit || preset === 'custom'" name="actions">
      <button type="submit" class="apply-period" :disabled="disabled">Aplicar periodo</button>
    </slot>
  </form>
</template>

<style scoped>
.period-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 16px;
}
.period-field {
  display: grid;
  gap: 8px;
  flex: 1 1 180px;
  min-width: 0;
}
label {
  color: var(--text-on-dark-secondary);
  font-size: 0.875rem;
  font-weight: 600;
}
select,
button {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border-on-dark);
  border-radius: var(--radius-small);
}
select {
  color: var(--text-on-dark);
  background: var(--page-background);
}
.apply-period {
  flex: 0 1 160px;
  font-weight: 700;
  background: var(--button-background);
  color: var(--button-text);
  border-color: transparent;
}
.apply-period:hover {
  background: var(--button-hover-background);
}
.filter-error {
  flex-basis: 100%;
  margin: 0;
  color: var(--dark-error-text);
}
.period-filter--light label {
  color: var(--text-secondary);
}
.period-filter--light select {
  color: var(--text-primary);
  background: var(--input-background);
  border-color: var(--border-strong);
}
.period-filter--light .filter-error {
  color: var(--error-text);
}
@media (max-width: 480px) {
  .period-field,
  .apply-period {
    flex-basis: 100%;
  }
}
</style>
