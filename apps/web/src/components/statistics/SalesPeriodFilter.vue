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
const preset = ref<StatisticsPeriod>('last30days')
const initial = statisticsPeriod('last30days')
const dateFrom = ref(initial.dateFrom)
const dateTo = ref(initial.dateTo)
const error = ref('')

function apply() {
  error.value = statisticsPeriodError(dateFrom.value, dateTo.value)
  if (!error.value) emit('apply', { dateFrom: dateFrom.value, dateTo: dateTo.value })
}
function changePreset() {
  error.value = ''
  if (preset.value === 'custom') return
  const period = statisticsPeriod(preset.value)
  dateFrom.value = period.dateFrom
  dateTo.value = period.dateTo
  apply()
}
</script>

<template>
  <form class="period-filter" novalidate @submit.prevent="apply">
    <div class="period-field">
      <label for="sales-period">Periodo</label>
      <select id="sales-period" v-model="preset" @change="changePreset">
        <option v-for="period in STATISTICS_PERIODS" :key="period.value" :value="period.value">
          {{ period.label }}
        </option>
      </select>
    </div>
    <template v-if="preset === 'custom'">
      <div class="period-field">
        <label for="sales-date-from">Desde</label>
        <DatePicker
          id="sales-date-from"
          v-model="dateFrom"
          required
          :aria-invalid="!!error"
          :aria-describedby="error ? 'sales-period-error' : undefined"
        />
      </div>
      <div class="period-field">
        <label for="sales-date-to">Hasta</label>
        <DatePicker
          id="sales-date-to"
          v-model="dateTo"
          required
          :aria-invalid="!!error"
          :aria-describedby="error ? 'sales-period-error' : undefined"
        />
      </div>
      <button type="submit" class="apply-period">Aplicar periodo</button>
    </template>
    <p v-if="error" id="sales-period-error" class="filter-error" role="alert">{{ error }}</p>
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
@media (max-width: 480px) {
  .period-field,
  .apply-period {
    flex-basis: 100%;
  }
}
</style>
