<script setup lang="ts">
import PaginationControls from '@/components/common/PaginationControls.vue'
import DatePicker from '@/components/common/DatePicker.vue'
import { computed, onBeforeUnmount, reactive, ref, useId } from 'vue'
import { isAxiosError } from 'axios'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import TransactionDetailDialog from '@/components/transactions/TransactionDetailDialog.vue'
import { useEmployeeSessionRecovery } from '@/composables/useEmployeeSessionRecovery'
import { getTransactionFilterOptions, getTransactions } from '@/services/transaction.service'
import type {
  TransactionFilterOptions,
  TransactionListItem,
  TransactionListQuery,
  TransactionListResult,
  TransactionStatus,
} from '@/types/transaction'
import {
  TRANSACTION_STATUS_LABELS,
  formatColones,
  formatDate,
  formatFunction,
  formatTransactionId,
} from '@/utils/transaction-format'

const NO_NAME = 'Sin nombre registrado'
const DATE_FILTERS = [
  { name: 'dateFrom', label: 'Fecha inicio' },
  { name: 'dateTo', label: 'Fecha fin' },
] as const

const props = defineProps<{ disabled?: boolean }>()
const { state, sessionExpired, refreshPermissions } = useEmployeeSessionRecovery()
const id = useId()
const searchDraft = ref('')
const appliedSearch = ref('')
const searchError = ref('')
const filters = reactive({
  branchId: '' as number | '',
  movieId: '' as number | '',
  status: '' as TransactionStatus | '',
  dateFrom: '',
  dateTo: '',
})
const page = ref(1)
const result = ref<TransactionListResult | null>(null)
const loading = ref(false)
const listError = ref<'forbidden' | 'failed' | 'invalid' | ''>('')
const options = ref<TransactionFilterOptions>({ branches: [], movies: [] })
const optionsLoading = ref(false)
const optionsError = ref(false)
const selectedTransactionId = ref<number | null>(null)
let listRequest: AbortController | undefined
let optionsRequest: AbortController | undefined

const columns = [
  { key: 'displayId', label: 'IdTransacción' },
  { key: 'date', label: 'Fecha' },
  { key: 'client', label: 'Cliente' },
  { key: 'function', label: 'Película y función' },
  { key: 'tickets', label: 'Boletos' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Estado' },
]
const rows = computed(() =>
  (result.value?.items ?? []).map((transaction) => ({
    id: transaction.id,
    displayId: formatTransactionId(transaction.id),
    date: formatDate(transaction.purchasedAt),
    client: transaction.clientName,
    function: formatFunction(transaction),
    tickets: transaction.tickets,
    total: formatColones(transaction.total),
    status: TRANSACTION_STATUS_LABELS[transaction.status],
    transaction,
  })),
)
const dateError = computed(() =>
  filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
    ? 'La fecha de inicio no puede ser posterior a la fecha de fin.'
    : '',
)
const validationError = computed(() => searchError.value || dateError.value)
const hasFilters = computed(
  () =>
    !!appliedSearch.value ||
    !!searchDraft.value ||
    Object.values(filters).some((value) => value !== '') ||
    !!validationError.value,
)

function failed(error: unknown) {
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (status === 401) sessionExpired()
  else if (status === 403) void refreshPermissions()
  return status
}

async function load() {
  listRequest?.abort()
  if (dateError.value) return
  const request = new AbortController()
  listRequest = request
  loading.value = true
  listError.value = ''
  const query: TransactionListQuery = {
    page: page.value,
    pageSize: 10,
    ...(appliedSearch.value ? { search: appliedSearch.value } : {}),
    ...(filters.branchId !== '' ? { branchId: filters.branchId } : {}),
    ...(filters.movieId !== '' ? { movieId: filters.movieId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
  }
  try {
    const data = await getTransactions(query, request.signal)
    if (request.signal.aborted || state.disposed) return
    result.value = data
    page.value = data.page
  } catch (error) {
    if (request.signal.aborted || state.disposed) return
    result.value = null
    const status = failed(error)
    if (status === 400) listError.value = 'invalid'
    else listError.value = status === 403 ? 'forbidden' : 'failed'
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
  optionsLoading.value = true
  optionsError.value = false
  try {
    const data = await getTransactionFilterOptions(request.signal)
    if (!request.signal.aborted && !state.disposed) options.value = data
  } catch (error) {
    if (request.signal.aborted || state.disposed) return
    failed(error)
    optionsError.value = true
  } finally {
    if (optionsRequest === request) {
      optionsLoading.value = false
      optionsRequest = undefined
    }
  }
}

function search() {
  if (props.disabled) return
  const value = searchDraft.value
  searchError.value = ''
  if (value !== '' && !value.trim())
    searchError.value = 'La búsqueda no puede contener solo espacios.'
  else if (/\p{Cc}/u.test(value)) searchError.value = 'La búsqueda contiene caracteres no válidos.'
  else if (value.trim().length > 100)
    searchError.value = 'La búsqueda no puede superar 100 caracteres.'
  if (searchError.value) return
  appliedSearch.value = value.trim().replace(/\s+/gu, ' ')
  page.value = 1
  void load()
}
function filtersChanged() {
  page.value = 1
  void load()
}
function clearFilters() {
  searchDraft.value = ''
  appliedSearch.value = ''
  searchError.value = ''
  Object.assign(filters, { branchId: '', movieId: '', status: '', dateFrom: '', dateTo: '' })
  page.value = 1
  void load()
}
function changePage(value: number) {
  if (loading.value || !result.value || value < 1 || value > result.value.totalPages) return
  page.value = value
  void load()
}
function transactionOf(row: { [key: string]: unknown }) {
  return row.transaction as TransactionListItem
}
function viewTransaction(row: { [key: string]: unknown }) {
  if (!props.disabled) selectedTransactionId.value = transactionOf(row).id
}

void load()
void loadOptions()

onBeforeUnmount(() => {
  listRequest?.abort()
  optionsRequest?.abort()
})
</script>

<template>
  <section class="preview-content transactions-section" aria-labelledby="transactions-title">
    <div class="section-heading">
      <h1 id="transactions-title">Transacciones</h1>
    </div>

    <form class="search-bar" novalidate @submit.prevent="search">
      <div class="search-field">
        <label :for="id + '-search'">Buscar transacciones</label>
        <div class="search-input">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input
            :id="id + '-search'"
            v-model="searchDraft"
            type="search"
            name="search"
            placeholder="ID de transacción, cliente o película"
            :aria-invalid="!!searchError"
            :aria-describedby="validationError ? id + '-validation' : undefined"
          />
        </div>
      </div>
      <button type="submit" class="primary-button" :disabled="disabled">Buscar</button>
      <button type="button" class="secondary-button" :disabled="!hasFilters" @click="clearFilters">
        <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros
      </button>
    </form>

    <div class="filters">
      <label
        ><span class="visually-hidden">Sucursal</span
        ><select
          v-model="filters.branchId"
          name="branchId"
          :disabled="optionsLoading || optionsError"
          @change="filtersChanged"
        >
          <option value="">Todas las sucursales</option>
          <option v-for="branch in options.branches" :key="branch.id" :value="branch.id">
            {{ branch.name ?? NO_NAME }}
          </option>
        </select></label
      >
      <label
        ><span class="visually-hidden">Película</span
        ><select
          v-model="filters.movieId"
          name="movieId"
          :disabled="optionsLoading || optionsError"
          @change="filtersChanged"
        >
          <option value="">Todas las películas</option>
          <option v-for="movie in options.movies" :key="movie.id" :value="movie.id">
            {{ movie.title }}
          </option>
        </select></label
      >
      <label
        ><span class="visually-hidden">Estado</span
        ><select v-model="filters.status" name="status" @change="filtersChanged">
          <option value="">Todos los estados</option>
          <option v-for="(label, value) in TRANSACTION_STATUS_LABELS" :key="value" :value="value">
            {{ label }}
          </option>
        </select></label
      >
      <div v-for="date in DATE_FILTERS" :key="date.name" class="date-filter">
        <label :for="id + '-' + date.name">{{ date.label }}</label>
        <DatePicker
          :id="id + '-' + date.name"
          v-model="filters[date.name]"
          :name="date.name"
          :aria-invalid="!!dateError"
          @change="filtersChanged"
        />
      </div>
      <p v-if="optionsError" class="filter-error" role="alert">
        No se pudieron cargar los filtros.
        <button type="button" class="link-button" @click="loadOptions">Reintentar</button>
      </p>
    </div>
    <p v-if="validationError" :id="id + '-validation'" class="feedback error" role="alert">
      {{ validationError }}
    </p>

    <div class="list-content" :aria-busy="loading">
      <LoadingState v-if="loading" message="Cargando transacciones…" />
      <div v-else-if="listError === 'forbidden'" class="state-card error" role="alert">
        <i class="bi bi-shield-lock" aria-hidden="true"></i>
        <h2>No tiene permisos para acceder a esta sección</h2>
      </div>
      <div v-else-if="listError === 'invalid'" class="state-card error" role="alert">
        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
        <h2>La búsqueda o los filtros no son válidos</h2>
        <p>Revisa los valores e inténtalo de nuevo.</p>
      </div>
      <div v-else-if="listError" class="state-card error" role="alert">
        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
        <h2>No se pudieron cargar las transacciones, intenta de nuevo</h2>
        <button type="button" class="secondary-button" @click="load">Reintentar</button>
      </div>
      <template v-else-if="result && !dateError">
        <p class="result-count" role="status">
          {{ result.total }} {{ result.total === 1 ? 'transacción' : 'transacciones' }}
        </p>
        <CrudTable
          v-if="result.items.length"
          :columns="columns"
          :rows="rows"
          caption="Transacciones"
        >
          <template #cell-client="{ row }">
            <strong class="primary-text">{{ transactionOf(row).clientName }}</strong>
            <span class="secondary-text">{{ transactionOf(row).clientEmail }}</span>
          </template>
          <template #cell-function="{ row, value }">
            <span class="primary-text">{{ value }}</span>
            <span class="secondary-text">{{ transactionOf(row).branchName ?? NO_NAME }}</span>
          </template>
          <template #cell-status="{ row, value }">
            <span :class="['status-badge', transactionOf(row).status.toLowerCase()]">{{
              value
            }}</span>
          </template>
          <template #actions="{ row }">
            <button
              type="button"
              class="detail-button"
              :aria-label="`Ver detalle de ${row.displayId}`"
              :disabled="disabled"
              @click="viewTransaction(row)"
            >
              <i class="bi bi-eye" aria-hidden="true"></i> Ver detalle
            </button>
          </template>
        </CrudTable>
        <div v-else class="state-card">
          <i :class="['bi', hasFilters ? 'bi-search' : 'bi-receipt']" aria-hidden="true"></i>
          <h2>
            {{
              hasFilters ? 'No se encontraron transacciones' : 'No hay transacciones disponibles'
            }}
          </h2>
          <p v-if="hasFilters">Prueba con otra búsqueda o limpia los filtros.</p>
        </div>
      </template>
    </div>

    <footer v-if="result && !listError && !dateError" class="pagination-bar">
      <PaginationControls
        label="Paginación de transacciones"
        :page="result.page"
        :total-pages="result.totalPages"
        :disabled="loading"
        @change="changePage"
      />
    </footer>
    <TransactionDetailDialog
      :transaction-id="selectedTransactionId"
      @close="selectedTransactionId = null"
      @session-expired="sessionExpired"
      @forbidden="refreshPermissions"
      @missing="load"
    />
  </section>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  align-items: end;
  gap: 12px;
}
.filters label,
.date-filter {
  min-width: 0;
  max-width: 100%;
}
.filters :is(input, select) {
  box-sizing: border-box;
  height: var(--filter-control-height);
  min-height: var(--filter-control-height);
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.transactions-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: 16px;
}
.section-heading {
  margin-bottom: 4px;
}
.list-content {
  min-width: 0;
}
.search-bar,
.pagination-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}
label,
.date-filter {
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
  left: 14px;
  top: 14px;
  color: var(--text-secondary);
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
  border: 1px solid var(--border-color);
  background: var(--content-background);
  color: var(--text-primary);
  padding: 10px 12px;
}
.search-input input {
  width: 100%;
  padding-left: 40px;
}
input[aria-invalid='true'] {
  border-color: var(--error-color);
}
.filters label {
  flex: 1;
  min-width: 0;
}
.filter-error {
  margin: 0;
  align-self: center;
  color: var(--error-color);
  font-size: 0.875rem;
}
button {
  padding: 10px 16px;
  border: 1px solid var(--primary-color);
  cursor: pointer;
}
.primary-button {
  background: var(--button-background);
  color: var(--button-text);
  border-color: var(--button-background);
}
.secondary-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--content-background);
  color: var(--button-secondary-text);
}
.link-button {
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-decoration: underline;
}
button:disabled,
select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.detail-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 10px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  white-space: nowrap;
}
.detail-button:not(:disabled):hover {
  background: var(--surface-hover);
}
.primary-text,
.secondary-text {
  display: block;
}
.secondary-text {
  color: var(--text-secondary);
  font-size: 0.875rem;
}
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-small);
  font-weight: 600;
}
.status-badge.paid {
  background: var(--success-background);
  color: var(--success-text);
}
.status-badge.cancelled {
  background: var(--error-background);
  color: var(--error-text);
}
.feedback {
  margin: 0;
  padding: 16px;
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
  font-size: 0.875rem;
  color: var(--text-on-dark-secondary);
}
.state-card {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 40px 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-medium);
  background: var(--content-background);
  color: var(--text-primary);
  text-align: center;
}
.state-card i {
  font-size: 2rem;
}
.state-card h2 {
  margin: 0;
  font-size: 1.125rem;
}
.state-card p {
  margin: 0;
  color: var(--text-secondary);
}
.state-card.error i {
  color: var(--error-color);
}
.pagination-bar {
  justify-content: center;
  align-items: center;
  font-size: 0.875rem;
}
@media (max-width: 600px) {
  .search-field {
    flex-basis: 100%;
  }
  .search-bar .primary-button,
  .search-bar .secondary-button {
    flex: 1;
  }
}
</style>
