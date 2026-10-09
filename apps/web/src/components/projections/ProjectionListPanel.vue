<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId } from 'vue'
import { isAxiosError } from 'axios'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import ProjectionDetailDialog from './ProjectionDetailDialog.vue'
import ProjectionStatusBadge from './ProjectionStatusBadge.vue'
import { getProjectionFilterOptions, getProjections } from '@/services/projection.service'
import {
  CANCELLABLE_STATUSES,
  EDITABLE_STATUSES,
  PROJECTION_STATUS_LABELS,
  type ListedProjection,
  type ProjectionFilterOptions,
  type ProjectionList,
  type ProjectionListQuery,
  type ProjectionStatus,
} from '@/types/projection'
import {
  formatPrice,
  formatProjectionDate,
  formatProjectionDuration,
  formatProjectionTime,
  projectionCode,
} from '@/utils/projection-format'

const PAGE_SIZES = [10, 25, 50, 100]
// Time filters are a predefined list every 30 minutes, always shown in 12-hour format.
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const value = `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`
  return { value, label: formatProjectionTime(`0000-00-00T${value}`) }
})
const dateFilters = [
  { name: 'dateFrom', label: 'Fecha inicio' },
  { name: 'dateTo', label: 'Fecha fin' },
] as const
const timeFilters = [
  { name: 'timeFrom', label: 'Hora inicio' },
  { name: 'timeTo', label: 'Hora fin' },
] as const
const emit = defineEmits<{
  sessionExpired: []
  forbidden: []
  edit: [id: number]
  cancel: [projection: ListedProjection]
}>()
const id = useId()
const emptyFilters = () => ({
  status: '' as ProjectionStatus | '',
  branchId: '',
  theaterId: '',
  movieId: '',
  dateFrom: '',
  dateTo: '',
  timeFrom: '',
  timeTo: '',
})
const filters = reactive(emptyFilters())
const searchDraft = ref('')
const appliedSearch = ref('')
const page = ref(1)
const pageSize = ref(10)
const options = ref<ProjectionFilterOptions | null>(null)
const optionsError = ref('')
const result = ref<ProjectionList | null>(null)
const loading = ref(false)
const listError = ref('')
const selectedId = ref<number | null>(null)
let listRequest: AbortController | undefined
let optionsRequest: AbortController | undefined

const statuses = Object.entries(PROJECTION_STATUS_LABELS) as [ProjectionStatus, string][]
const theaters = computed(() =>
  (options.value?.theaters ?? []).filter(
    (theater) => !filters.branchId || String(theater.branchId) === filters.branchId,
  ),
)
// Full names for the tooltips of selects whose value is cut with an ellipsis.
const selectedBranchName = computed(
  () => options.value?.cinemas.find((cinema) => String(cinema.branchId) === filters.branchId)?.name,
)
const selectedMovieTitle = computed(
  () => options.value?.movies.find((movie) => String(movie.movieId) === filters.movieId)?.title,
)
const validationError = computed(() => {
  if (searchDraft.value.trim().length > 100) return 'La búsqueda admite como máximo 100 caracteres.'
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
    return 'La fecha inicial no puede ser posterior a la fecha final.'
  if (filters.timeFrom && filters.timeTo && filters.timeFrom > filters.timeTo)
    return 'La hora inicial no puede ser posterior a la hora final.'
  return ''
})
const hasFilters = computed(
  () => !!appliedSearch.value || Object.values(filters).some((value) => value !== ''),
)
const columns = [
  { key: 'number', label: 'No.' },
  { key: 'movieTitle', label: 'Película' },
  { key: 'code', label: 'ID Proyección' },
  { key: 'branchName', label: 'Sucursal' },
  { key: 'theater', label: 'Sala' },
  { key: 'date', label: 'Fecha' },
  { key: 'time', label: 'Hora' },
  { key: 'duration', label: 'Duración' },
  { key: 'price', label: 'Precio' },
  { key: 'status', label: 'Estado' },
]
const rows = computed(() =>
  (result.value?.items ?? []).map((item, index) => ({
    id: item.movieFunctionId,
    number: (result.value!.page - 1) * result.value!.pageSize + index + 1,
    movieTitle: item.movieTitle,
    code: projectionCode('MF', item.movieFunctionId),
    branchName: item.branchName,
    theater: `Sala ${item.theaterId}`,
    date: formatProjectionDate(item.startTime),
    time: formatProjectionTime(item.startTime),
    duration: formatProjectionDuration(item.startTime, item.endTime),
    price: formatPrice(item.price),
    status: item.status,
  })),
)
/** Page numbers around the current one, with gaps ("…") between distant pages. */
const pages = computed(() => {
  const total = result.value?.totalPages ?? 0
  const current = result.value?.page ?? 1
  const visible = [...new Set([1, current - 1, current, current + 1, total])]
    .filter((number) => number >= 1 && number <= total)
    .sort((a, b) => a - b)
  return visible.flatMap((number, index) =>
    index && number - visible[index - 1]! > 1 ? ['…', number] : [number],
  )
})

function buildQuery(): ProjectionListQuery {
  const query: ProjectionListQuery = { page: page.value, pageSize: pageSize.value }
  if (appliedSearch.value) query.search = appliedSearch.value
  if (filters.status) query.status = filters.status
  for (const key of ['branchId', 'theaterId', 'movieId'] as const)
    if (filters[key]) query[key] = Number(filters[key])
  for (const key of ['dateFrom', 'dateTo', 'timeFrom', 'timeTo'] as const)
    if (filters[key]) query[key] = filters[key]
  return query
}

function handleFailure(error: unknown, fallback: string) {
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (status === 401) emit('sessionExpired')
  else if (status === 403) emit('forbidden')
  return status === 403 ? 'No tienes permisos para realizar esta acción.' : fallback
}

async function load() {
  if (validationError.value) return
  listRequest?.abort()
  const request = new AbortController()
  listRequest = request
  loading.value = true
  listError.value = ''
  try {
    const list = await getProjections(buildQuery(), request.signal)
    if (!request.signal.aborted) result.value = list
  } catch (error) {
    if (request.signal.aborted) return
    listError.value = handleFailure(
      error,
      'No se pudo cargar la lista de proyecciones, intenta de nuevo.',
    )
  } finally {
    if (listRequest === request) {
      loading.value = false
      listRequest = undefined
    }
  }
}

async function loadOptions() {
  optionsRequest?.abort()
  const request = new AbortController()
  optionsRequest = request
  optionsError.value = ''
  try {
    const loaded = await getProjectionFilterOptions(request.signal)
    if (!request.signal.aborted) options.value = loaded
  } catch (error) {
    if (request.signal.aborted) return
    optionsError.value = handleFailure(
      error,
      'No se pudieron cargar las opciones de los filtros.',
    )
  }
}

function filtersChanged() {
  if (
    filters.theaterId &&
    !theaters.value.some((theater) => String(theater.theaterId) === filters.theaterId)
  )
    filters.theaterId = ''
  page.value = 1
  void load()
}

function search() {
  if (validationError.value) return
  appliedSearch.value = searchDraft.value.trim()
  filtersChanged()
}

function clearFilters() {
  Object.assign(filters, emptyFilters())
  searchDraft.value = ''
  appliedSearch.value = ''
  filtersChanged()
}

function changePage(target: number) {
  page.value = target
  void load()
}

function requestCancel(id: number) {
  const projection = result.value?.items.find((item) => item.movieFunctionId === id)
  if (projection) emit('cancel', projection)
}

function refresh() {
  void loadOptions()
  void load()
}

onMounted(refresh)
onBeforeUnmount(() => {
  listRequest?.abort()
  optionsRequest?.abort()
})

defineExpose({ refresh })
</script>

<template>
  <div class="projection-list-panel">
    <form class="search-bar" novalidate @submit.prevent="search">
      <div class="search-field">
        <label :for="id + '-search'">Buscar proyecciones</label>
        <div class="search-input">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input
            :id="id + '-search'"
            v-model="searchDraft"
            type="search"
            name="search"
            placeholder="Película o ID de proyección"
            :aria-invalid="!!validationError"
          />
        </div>
      </div>
      <button type="submit" class="primary-button">Buscar</button>
      <button type="button" class="secondary-button" :disabled="!hasFilters" @click="clearFilters">
        <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros
      </button>
    </form>

    <fieldset class="filters" :disabled="!options">
      <legend class="visually-hidden">Filtros de proyecciones</legend>
      <label>
        Estado
        <select v-model="filters.status" name="status" @change="filtersChanged">
          <option value="">Todos</option>
          <option v-for="[value, label] in statuses" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label>
        Sucursal
        <select
          v-model="filters.branchId"
          name="branchId"
          :title="selectedBranchName"
          @change="filtersChanged"
        >
          <option value="">Todas</option>
          <option
            v-for="cinema in options?.cinemas"
            :key="cinema.branchId"
            :value="String(cinema.branchId)"
          >
            {{ cinema.name }}
          </option>
        </select>
      </label>
      <label>
        Sala
        <select v-model="filters.theaterId" name="theaterId" @change="filtersChanged">
          <option value="">Todas</option>
          <option
            v-for="theater in theaters"
            :key="theater.theaterId"
            :value="String(theater.theaterId)"
          >
            Sala {{ theater.theaterId }}
          </option>
        </select>
      </label>
      <label>
        Película
        <select
          v-model="filters.movieId"
          name="movieId"
          :title="selectedMovieTitle"
          @change="filtersChanged"
        >
          <option value="">Todas</option>
          <option v-for="movie in options?.movies" :key="movie.movieId" :value="String(movie.movieId)">
            {{ movie.title }}
          </option>
        </select>
      </label>
      <label v-for="date in dateFilters" :key="date.name">
        <span>{{ date.label }} <small class="format-hint">(dd/mm/aaaa)</small></span>
        <input
          v-model="filters[date.name]"
          type="date"
          :name="date.name"
          :title="`${date.label}: día/mes/año`"
          @change="filtersChanged"
        />
      </label>
      <label v-for="time in timeFilters" :key="time.name">
        <span>{{ time.label }} <small class="format-hint">(12 h, hh:mm am/pm)</small></span>
        <select v-model="filters[time.name]" :name="time.name" @change="filtersChanged">
          <option value="">Cualquiera</option>
          <option v-for="option in TIME_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
    </fieldset>
    <p v-if="validationError" class="feedback error" role="alert">{{ validationError }}</p>
    <div v-if="optionsError" class="feedback error" role="alert">
      {{ optionsError }}
      <button type="button" class="secondary-button" @click="loadOptions">Reintentar</button>
    </div>

    <div class="list-content" :aria-busy="loading">
      <p v-if="loading" class="feedback" role="status">Cargando proyecciones…</p>
      <div v-else-if="listError" class="feedback error" role="alert">
        {{ listError }}
        <button type="button" class="secondary-button" @click="load">Reintentar</button>
      </div>
      <template v-else-if="result">
        <p class="result-count" role="status">
          {{ result.total }} {{ result.total === 1 ? 'proyección' : 'proyecciones' }}
        </p>
        <CrudTable v-if="rows.length" :columns="columns" :rows="rows" caption="Proyecciones">
          <template #cell-status="{ value }">
            <ProjectionStatusBadge :status="value as ProjectionStatus" />
          </template>
          <template #actions="{ row }">
            <div class="row-actions">
              <button
                type="button"
                title="Ver detalle"
                :aria-label="`Ver detalle de ${row.code}`"
                @click="selectedId = row.id as number"
              >
                <i class="bi bi-eye" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                :title="EDITABLE_STATUSES.includes(row.status as ProjectionStatus) ? 'Modificar' : 'Solo se modifican proyecciones activas o inactivas'"
                :aria-label="`Modificar ${row.code}`"
                :disabled="!EDITABLE_STATUSES.includes(row.status as ProjectionStatus)"
                @click="emit('edit', row.id as number)"
              >
                <i class="bi bi-pencil-square" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                :title="CANCELLABLE_STATUSES.includes(row.status as ProjectionStatus) ? 'Cancelar' : 'Ya está cancelada o finalizada'"
                :aria-label="`Cancelar ${row.code}`"
                :disabled="!CANCELLABLE_STATUSES.includes(row.status as ProjectionStatus)"
                @click="requestCancel(row.id as number)"
              >
                <i class="bi bi-x-circle" aria-hidden="true"></i>
              </button>
            </div>
          </template>
        </CrudTable>
        <div v-else class="empty-state">
          <i class="bi bi-calendar-x" aria-hidden="true"></i>
          <h2>
            {{
              hasFilters
                ? 'No se encontraron proyecciones con estos criterios'
                : 'No hay proyecciones programadas'
            }}
          </h2>
          <p>
            {{
              hasFilters
                ? 'Prueba con otros filtros o límpialos.'
                : 'Las proyecciones aparecerán aquí cuando se agreguen.'
            }}
          </p>
        </div>
        <footer class="pagination-bar">
          <label class="page-size">
            Mostrar
            <select v-model.number="pageSize" name="pageSize" @change="filtersChanged">
              <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
            </select>
          </label>
          <nav aria-label="Paginación de proyecciones">
            <button
              type="button"
              class="secondary-button"
              :disabled="result.page <= 1"
              @click="changePage(result.page - 1)"
            >
              <i class="bi bi-arrow-left" aria-hidden="true"></i> Anterior
            </button>
            <template v-for="(item, index) in pages" :key="`${item}-${index}`">
              <span v-if="item === '…'" class="page-gap" aria-hidden="true">…</span>
              <button
                v-else
                type="button"
                class="page-button"
                :class="{ 'is-current': item === result.page }"
                :aria-current="item === result.page ? 'page' : undefined"
                :aria-label="`Página ${item}`"
                @click="changePage(item as number)"
              >
                {{ item }}
              </button>
            </template>
            <button
              type="button"
              class="secondary-button"
              :disabled="result.page >= result.totalPages"
              @click="changePage(result.page + 1)"
            >
              Siguiente <i class="bi bi-arrow-right" aria-hidden="true"></i>
            </button>
          </nav>
        </footer>
      </template>
    </div>

    <ProjectionDetailDialog
      :projection-id="selectedId"
      @close="selectedId = null"
      @session-expired="emit('sessionExpired')"
      @forbidden="emit('forbidden')"
    />
  </div>
</template>

<style scoped>
.projection-list-panel {
  display: grid;
  gap: 16px;
}
.search-bar,
.pagination-bar,
.pagination-bar nav {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}
/* Fixed-width columns: a long option never pushes a field over its neighbour. */
.filters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
label {
  display: grid;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 600;
}
.search-field {
  flex: 1;
  min-width: min(100%, 280px);
}
.search-input {
  position: relative;
}
.search-input i {
  position: absolute;
  top: 14px;
  left: 14px;
  color: var(--text-secondary);
}
.search-input input {
  width: 100%;
  padding-left: 40px;
}
input,
select,
button {
  min-height: 44px;
  border-radius: var(--radius-small);
  font: inherit;
}
input,
select {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  background: var(--content-background);
}
input[aria-invalid='true'] {
  border-color: var(--error-color);
}
.filters label {
  min-width: 0;
}
.format-hint {
  color: var(--text-secondary);
  font-size: 0.75rem;
  font-weight: 400;
}
.filters input,
.filters select {
  width: 100%;
  min-width: 0;
}
.filters select {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
button {
  padding: 10px 16px;
  border: 1px solid var(--primary-color);
  cursor: pointer;
}
.primary-button {
  color: var(--button-text);
  background: var(--button-background);
}
.secondary-button {
  color: var(--text-primary);
  background: var(--content-background);
}
button:disabled,
fieldset:disabled select,
fieldset:disabled input {
  opacity: 0.5;
  cursor: default;
}
input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.row-actions button {
  display: inline-grid;
  place-items: center;
  width: 36px;
  min-height: 36px;
  padding: 0;
  border: 0;
  color: var(--text-primary);
  font-size: 1.125rem;
  background: transparent;
}
.row-actions {
  display: flex;
  gap: 4px;
}
.row-actions button:not(:disabled):hover {
  background: var(--input-disabled-background);
  color: var(--text-primary);
}
.row-actions button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.feedback,
.empty-state {
  margin: 0;
  padding: 24px;
  border-radius: var(--radius-medium);
  background: var(--content-background);
  color: var(--text-primary);
}
.error {
  color: var(--error-color);
  border-left: 4px solid var(--error-color);
}
.result-count {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.empty-state {
  text-align: center;
}
.empty-state i {
  font-size: 2rem;
}
.empty-state h2 {
  margin: 12px 0;
  font-size: 1.125rem;
}
.empty-state p {
  margin: 0;
}
.pagination-bar {
  justify-content: center;
  align-items: center;
  margin-top: 16px;
  font-size: 0.875rem;
}
.page-size {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pagination-bar nav {
  align-items: center;
  gap: 6px;
}
.page-button {
  min-width: 40px;
  padding: 8px 12px;
  border-color: transparent;
  color: var(--text-primary);
  background: transparent;
}
.page-button.is-current {
  color: var(--text-on-dark);
  background: var(--surface-background);
}
.page-gap {
  padding: 0 4px;
}
</style>
