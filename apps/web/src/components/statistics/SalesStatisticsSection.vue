<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import DataChart from '@/components/common/DataChart.vue'
import InfoPopover from '@/components/common/InfoPopover.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import SalesPeriodFilter from './SalesPeriodFilter.vue'
import { getSalesStatistics } from '@/services/sales-statistics.service'
import { invalidateEmployeeSession } from '@/services/employee-session.service'
import { authErrorMessage, authErrorStatus } from '@/utils/auth-errors'
import { displayText } from '@/utils/display-text'
import {
  statisticsAgeError,
  statisticsPeriod,
  statisticsPeriodCaption,
} from '@/utils/statistics-period'
import type { SalesGroup, SalesMetric, SalesStatistics } from '@/types/sales-statistics'

const router = useRouter()
const data = ref<SalesStatistics | null>(null)
const query = ref(statisticsPeriod('last30days'))
const loading = ref(false)
const error = ref('')
const notice = ref('')
const metric = ref<SalesMetric>('revenue')
const ranking = ref<'movies' | 'genres' | 'languages' | 'branches'>('movies')
const audience = ref<'ages' | 'ageRanges' | 'genders'>('ageRanges')
const agePreset = ref('all')
const minAge = ref('')
const maxAge = ref('')
const ageError = ref('')
const appliedAgeFilter = ref<{ min: number; max: number } | null>(null)
let request: AbortController | undefined
let revision = 0
let disposed = false
const count = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 })
const currency = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 2,
})
const formatValue = computed(
  () => (value: number) =>
    metric.value === 'revenue' ? currency.format(value) : count.format(value),
)
const metrics: { value: SalesMetric; label: string }[] = [
  { value: 'revenue', label: 'Ingresos' },
  { value: 'tickets', label: 'Boletos vendidos' },
  { value: 'purchases', label: 'Compras realizadas' },
]
const rankings = {
  movies: 'Películas más vendidas',
  genres: 'Géneros más vendidos',
  languages: 'Idiomas más vendidos',
  branches: 'Sucursales con más ventas',
}
const audiences = {
  ages: 'Edades del comprador',
  ageRanges: 'Rangos de edad',
  genders: 'Género del comprador',
}
const agePresets = [
  { value: 'all', label: 'Todas las edades' },
  { value: '0-17', label: 'Menores de 18' },
  { value: '18-24', label: '18–24 años' },
  { value: '25-34', label: '25–34 años' },
  { value: '35-44', label: '35–44 años' },
  { value: '45-54', label: '45–54 años' },
  { value: '55-64', label: '55–64 años' },
  { value: '65-9999', label: '65 años o más' },
  { value: 'custom', label: 'Rango personalizado' },
]
const formatDate = (value: string) => value.split('-').reverse().join('/')
const periodLabel = computed(
  () => `${formatDate(query.value.dateFrom)} — ${formatDate(query.value.dateTo)}`,
)
const periodCaption = computed(() =>
  statisticsPeriodCaption(query.value.dateFrom, query.value.dateTo),
)
const sectionTitle = (title: string) => `${title} ${periodCaption.value}`
const metricLabel = computed(() => metrics.find((option) => option.value === metric.value)!.label)
const groupingLabels = { day: 'día', week: 'semana', month: 'mes', year: 'año' }
const cards = computed(() =>
  data.value
    ? [
        {
          label: 'Ingresos por ventas',
          value: currency.format(data.value.summary.revenue),
          icon: 'bi-cash-stack',
        },
        {
          label: 'Boletos vendidos',
          value: count.format(data.value.summary.tickets),
          icon: 'bi-ticket-perforated',
        },
        {
          label: 'Compras realizadas',
          value: count.format(data.value.summary.purchases),
          icon: 'bi-bag-check',
        },
        {
          label: 'Promedio por compra',
          value: currency.format(data.value.summary.averagePurchase),
          icon: 'bi-graph-up-arrow',
        },
      ]
    : [],
)
function points(groups: SalesGroup[]) {
  return groups.map((group) => ({
    key: group.key,
    label: displayText(group.label),
    value: group[metric.value],
  }))
}
function ranked(groups: SalesGroup[], numeric = false) {
  return points(groups)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es', { numeric }))
    .slice(0, 10)
}
const rankingPoints = computed(() => ranked(data.value?.rankings[ranking.value] ?? []))
const rankingCaption = computed(() => {
  const total = rankingPoints.value.length
  if (!total) return 'No hay categorías con ventas'
  return total === 1 ? 'La categoría con más ventas' : `Las ${total} categorías con más ventas`
})
const series = computed(() =>
  points(data.value?.series ?? []).map((point) => ({ ...point, label: formatDate(point.key) })),
)
const provincePoints = computed(() =>
  points(data.value?.rankings.provinces ?? []).sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'),
  ),
)
const ageLabel = computed(() => {
  const filter = appliedAgeFilter.value
  if (!filter) return 'Todas las edades'
  if (filter.min === 65 && filter.max === 9999) return '65 años o más'
  return `${filter.min}–${filter.max} años`
})
const audienceGroups = computed(() => {
  if (!data.value) return []
  if (audience.value === 'genders' || !appliedAgeFilter.value)
    return data.value.rankings[audience.value]
  const { min, max } = appliedAgeFilter.value
  const ages = data.value.rankings.ages.filter(
    (age) => age.key !== 'UNKNOWN' && Number(age.key) >= min && Number(age.key) <= max,
  )
  if (audience.value === 'ages' || !ages.length) return ages
  return [
    ages.reduce<SalesGroup>(
      (total, age) => ({
        ...total,
        revenue: Math.round((total.revenue + age.revenue) * 100) / 100,
        tickets: total.tickets + age.tickets,
        purchases: total.purchases + age.purchases,
      }),
      { key: `${min}-${max}`, label: ageLabel.value, revenue: 0, tickets: 0, purchases: 0 },
    ),
  ]
})
const audiencePoints = computed(() => {
  if (!audienceGroups.value.some((group) => group.purchases > 0)) return []
  if (audience.value === 'genders')
    return points(audienceGroups.value).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return ranked(audienceGroups.value, true)
})

async function load() {
  request?.abort()
  const controller = new AbortController()
  request = controller
  const current = ++revision
  loading.value = true
  data.value = null
  error.value = ''
  notice.value = ''
  try {
    const result = await getSalesStatistics({ ...query.value }, controller.signal)
    if (disposed || current !== revision) return
    data.value = result
  } catch (error_) {
    if (disposed || current !== revision || controller.signal.aborted) return
    if (authErrorStatus(error_) === 401) {
      invalidateEmployeeSession()
      void router.replace({ path: '/', query: { login: 'employee', reason: 'expired' } })
      return
    }
    error.value = authErrorMessage(
      error_,
      'No se pudieron cargar las estadísticas del periodo seleccionado. Inténtalo nuevamente.',
    )
    notice.value = error.value
  } finally {
    if (!disposed && current === revision) loading.value = false
  }
}
function applyPeriod(period: { dateFrom: string; dateTo: string }) {
  query.value = { ...query.value, ...period }
  void load()
}
function applyAges() {
  ageError.value = statisticsAgeError(minAge.value, maxAge.value)
  if (ageError.value) return
  appliedAgeFilter.value = { min: Number(minAge.value), max: Number(maxAge.value) }
}
function changeAgePreset() {
  ageError.value = ''
  if (agePreset.value === 'custom') return
  if (agePreset.value === 'all') {
    appliedAgeFilter.value = null
    return
  }
  const [from, to] = agePreset.value.split('-')
  minAge.value = from!
  maxAge.value = to!
  applyAges()
}
onMounted(load)
onBeforeUnmount(() => {
  disposed = true
  revision++
  request?.abort()
})
</script>

<template>
  <section class="sales-statistics surface-theme--dark" aria-label="Estadísticas de ventas">
    <header class="statistics-heading">
      <h1>Estadísticas de ventas</h1>
      <button
        type="button"
        class="report-button"
        disabled
        title="Disponible en una próxima actualización"
      >
        <i class="bi bi-download" aria-hidden="true" /> Descargar reporte
      </button>
    </header>
    <div class="filters-card">
      <SalesPeriodFilter @apply="applyPeriod" />
      <p class="period-range"><i class="bi bi-calendar3" aria-hidden="true" /> {{ periodLabel }}</p>
    </div>
    <LoadingState v-if="loading" message="Cargando estadísticas…" surface="dark" />
    <div v-else-if="error" class="statistics-state" role="status">
      <i class="bi bi-exclamation-circle" aria-hidden="true" />
      <h3>No se pudieron cargar las estadísticas</h3>
      <p>Puedes intentar cargar nuevamente el periodo seleccionado.</p>
      <button type="button" class="primary-action" @click="load">Reintentar</button>
    </div>
    <template v-else-if="data">
      <div class="stat-cards">
        <article v-for="card in cards" :key="card.label" class="stat-card">
          <i :class="['bi', card.icon]" aria-hidden="true" />
          <p>{{ card.label }}</p>
          <strong>{{ card.value }}</strong>
        </article>
      </div>
      <div class="chart-toolbar">
        <label for="sales-metric" class="metric-label"
          ><span>Mostrar</span
          ><select id="sales-metric" v-model="metric">
            <option v-for="option in metrics" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select></label
        >
        <InfoPopover title="Información de las estadísticas" surface="dark">
          <p>Se incluyen las compras pagadas de clientes e invitados.</p>
          <p>
            Los importes se muestran en colones costarricenses y las fechas usan la hora de Costa
            Rica.
          </p>
          <p>
            La opción «Mostrar» cambia la medida de los gráficos. Los indicadores superiores
            conservan sus totales del periodo.
          </p>
        </InfoPopover>
      </div>
      <div v-if="!data.summary.purchases" class="statistics-state" role="status">
        <i class="bi bi-bar-chart" aria-hidden="true" />
        <h3>No hubo ventas en este periodo</h3>
        <p>Selecciona otro periodo para consultar sus estadísticas.</p>
      </div>
      <template v-else>
        <div class="chart-grid">
          <article class="chart-card">
            <header>
              <div>
                <h3>{{ sectionTitle('Evolución de las ventas') }}</h3>
                <p>
                  {{ metrics.find((option) => option.value === metric)?.label }} por
                  {{ groupingLabels[data.period.grouping] }}
                </p>
              </div>
            </header>
            <DataChart
              :title="sectionTitle('Evolución de las ventas')"
              type="line"
              :points="series"
              :format-value="formatValue"
              x-label="Fecha de compra"
              :y-label="metricLabel"
            />
          </article>
          <article class="chart-card">
            <header>
              <h3>{{ sectionTitle('Ventas por provincia') }}</h3>
              <InfoPopover title="Información sobre las provincias" surface="dark">
                <p>Se usa la provincia registrada actualmente en el perfil del comprador.</p>
                <p>Los invitados y los datos faltantes se muestran como «Sin información».</p>
              </InfoPopover>
            </header>
            <DataChart
              :title="sectionTitle('Ventas por provincia')"
              type="donut"
              :points="provincePoints"
              :format-value="formatValue"
            />
          </article>
          <article class="chart-card">
            <header class="ranking-header">
              <div>
                <div class="chart-title">
                  <h3>{{ sectionTitle(rankings[ranking]) }}</h3>
                  <InfoPopover
                    v-if="ranking === 'genres' || ranking === 'languages'"
                    title="Información sobre las categorías"
                    surface="dark"
                  >
                    <p>
                      Una película puede tener varios géneros o idiomas. Sus ventas se incluyen en
                      cada categoría correspondiente.
                    </p>
                  </InfoPopover>
                </div>
                <p>{{ rankingCaption }}</p>
              </div>
              <label class="visually-hidden" for="sales-ranking">Estadística de ventas</label
              ><select id="sales-ranking" v-model="ranking">
                <option v-for="(label, value) in rankings" :key="value" :value="value">
                  {{ label }}
                </option>
              </select>
            </header>
            <DataChart
              :title="sectionTitle(rankings[ranking])"
              type="bar"
              :points="rankingPoints"
              :format-value="formatValue"
              :x-label="metricLabel"
              y-label="Categoría"
            />
          </article>
          <article class="chart-card">
            <header>
              <h3>{{ sectionTitle(audiences[audience]) }}</h3>
              <InfoPopover title="Información sobre los compradores" surface="dark">
                <p>Estos datos corresponden al comprador, no a todos los asistentes.</p>
                <p>
                  La edad actual se calcula a partir de la fecha de nacimiento. El género usa los
                  datos registrados actualmente.
                </p>
                <p>Los invitados y los datos faltantes se muestran como «Sin información».</p>
                <p>
                  El rango de edad solo se aplica a los gráficos de edades y rangos; no modifica las
                  demás estadísticas.
                </p>
                <p>
                  Se muestran hasta 10 edades o rangos con más {{ metricLabel.toLowerCase() }},
                  después de aplicar el filtro de edad.
                </p>
              </InfoPopover>
            </header>
            <div class="audience-select">
              <label for="sales-audience">Datos del comprador</label
              ><select id="sales-audience" v-model="audience">
                <option v-for="(label, value) in audiences" :key="value" :value="value">
                  {{ label }}
                </option>
              </select>
            </div>
            <form
              v-if="audience !== 'genders'"
              class="age-filter"
              novalidate
              @submit.prevent="applyAges"
            >
              <label for="sales-age-range">Rango de edad</label
              ><select id="sales-age-range" v-model="agePreset" @change="changeAgePreset">
                <option v-for="preset in agePresets" :key="preset.value" :value="preset.value">
                  {{ preset.label }}
                </option>
              </select>
              <div v-if="agePreset === 'custom'" class="custom-ages">
                <div>
                  <label for="sales-age-from">Desde (años)</label
                  ><input
                    id="sales-age-from"
                    v-model="minAge"
                    type="text"
                    inputmode="numeric"
                    maxlength="4"
                    :aria-invalid="!!ageError"
                    :aria-describedby="ageError ? 'sales-age-error' : undefined"
                  />
                </div>
                <div>
                  <label for="sales-age-to">Hasta (años)</label
                  ><input
                    id="sales-age-to"
                    v-model="maxAge"
                    type="text"
                    inputmode="numeric"
                    maxlength="4"
                    :aria-invalid="!!ageError"
                    :aria-describedby="ageError ? 'sales-age-error' : undefined"
                  />
                </div>
                <button type="submit" class="primary-action">Aplicar rango</button>
              </div>
              <p v-if="ageError" id="sales-age-error" class="age-error" role="alert">
                {{ ageError }}
              </p>
            </form>
            <p v-if="audience !== 'genders' && appliedAgeFilter" class="applied-age-range">
              {{ ageLabel }}
            </p>
            <DataChart
              :title="sectionTitle(audiences[audience])"
              class="audience-chart"
              :type="audience === 'genders' ? 'donut' : 'bar'"
              :points="audiencePoints"
              :format-value="formatValue"
              :x-label="metricLabel"
              :y-label="audience === 'ageRanges' ? 'Rango de edad (años)' : 'Edad (años)'"
            />
          </article>
        </div>
      </template>
    </template>
    <NotificationPopup
      v-if="notice"
      type="error"
      :message="notice"
      placement="bottom-right"
      @close="notice = ''"
    />
  </section>
</template>

<style scoped>
.sales-statistics {
  display: grid;
  gap: 24px;
  color: var(--text-on-dark);
  min-width: 0;
}
.statistics-heading {
  display: flex;
  gap: 24px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}
.statistics-heading h1 {
  margin: 0;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
}
.chart-card header p {
  margin: 0;
  color: var(--text-on-dark-secondary);
}
button,
select,
input {
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border-on-dark);
  border-radius: var(--radius-small);
}
select,
input {
  color: var(--text-on-dark);
  background: var(--page-background);
  width: 100%;
}
.report-button {
  color: var(--text-on-dark-secondary);
  background: transparent;
  opacity: 0.6;
  cursor: not-allowed;
}
.report-button i {
  margin-right: 8px;
}
.filters-card,
.stat-card,
.chart-card {
  background: var(--surface-background);
  border: 1px solid var(--border-on-dark);
  border-radius: var(--radius-medium);
  padding: 24px;
  min-width: 0;
}
.filters-card,
.chart-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.filters-card > :first-child {
  flex: 1 1 400px;
}
.period-range {
  display: flex;
  align-items: center;
  align-self: end;
  justify-content: flex-end;
  gap: 8px;
  min-height: 44px;
  padding: 10px 0;
  border-block: 1px solid transparent;
  margin: 0;
  margin-left: auto;
  text-align: right;
  color: var(--text-on-dark-secondary);
}
.period-range i {
  color: var(--accent-color);
}
.metric-label {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 1 310px;
  min-width: 0;
}
.metric-label > span {
  flex: 0 0 auto;
  white-space: nowrap;
}
.metric-label select {
  flex: 1;
  width: auto;
  min-width: 0;
}
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.stat-card i {
  display: inline-grid;
  place-items: center;
  padding: 10px;
  border-radius: 12px;
  background: var(--dark-info-background);
  color: var(--chart-color-2);
  font-size: 1.25rem;
}
.stat-card:nth-child(even) i {
  color: var(--accent-color);
  background: var(--dark-warning-background);
}
.stat-card p {
  color: var(--text-on-dark-secondary);
  margin: 16px 0 8px;
  font-size: 0.875rem;
}
.stat-card strong {
  font-size: clamp(1.25rem, 2.1vw, 1.75rem);
  overflow-wrap: anywhere;
}
.chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 24px;
}
.chart-card {
  display: flex;
  flex-direction: column;
}
.chart-card > .data-chart {
  flex: 1;
}
.audience-chart {
  min-height: 350px;
}
.chart-card header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.chart-card header > h3 {
  flex: 1;
}
.chart-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.chart-title h3 {
  flex: 1;
}
.chart-card header h3 {
  margin: 0 0 8px;
  font-size: 1.125rem;
  font-weight: 700;
}
.chart-card header p {
  font-size: 0.875rem;
}
.chart-card .ranking-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(180px, 40%, 240px);
  align-items: start;
}
.ranking-header > div {
  min-width: 0;
}
.ranking-header select {
  grid-column: 2;
  grid-row: 1;
}
.ranking-header h3 {
  overflow-wrap: anywhere;
}
.applied-age-range {
  color: var(--text-on-dark-secondary);
  font-size: 0.8125rem;
  line-height: 1.6;
  margin: 0 0 16px;
}
.statistics-state {
  text-align: center;
  padding: 48px 20px;
  border: 1px dashed var(--border-on-dark);
  border-radius: var(--radius-medium);
}
.statistics-state > i {
  font-size: 2.5rem;
  color: var(--accent-color);
}
.statistics-state h3 {
  margin-top: 20px;
  font-weight: 700;
}
.statistics-state p {
  color: var(--text-on-dark-secondary);
}
.primary-action {
  background: var(--button-background);
  color: var(--button-text);
  border-color: transparent;
  font-weight: 700;
}
.primary-action:hover {
  background: var(--button-hover-background);
}
.age-filter,
.audience-select {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}
.age-filter label,
.audience-select label {
  font-size: 0.875rem;
}
.custom-ages {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  margin-top: 8px;
}
.custom-ages > div {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.custom-ages > button {
  grid-column: 1 / -1;
}
.age-error {
  margin: 0;
  color: var(--dark-error-text);
  font-size: 0.875rem;
}
@media (max-width: 1100px) {
  .stat-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 480px) {
  .filters-card,
  .chart-card,
  .stat-card {
    padding: 16px;
  }
  .metric-label {
    width: 100%;
    flex-basis: 100%;
  }
  .chart-card .ranking-header {
    grid-template-columns: minmax(0, 1fr);
  }
  .ranking-header select {
    grid-column: 1;
  }
  .ranking-header > div {
    grid-row: 2;
  }
  .custom-ages button {
    width: 100%;
  }
}
</style>
