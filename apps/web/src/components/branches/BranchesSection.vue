<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { isAxiosError } from 'axios'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import BranchDetailDialog from '@/components/branches/BranchDetailDialog.vue'
import { useEmployeeSessionRecovery } from '@/composables/useEmployeeSessionRecovery'
import { formatBranchId, getBranches, getCompanies } from '@/services/branch.service'
import type {
  BranchListQuery,
  BranchListResult,
  BranchPageSize,
  CompanyOption,
} from '@/types/branch'

const PAGE_SIZES: readonly BranchPageSize[] = [10, 20, 50]
const NO_NAME = 'Sin nombre registrado'
const NO_COMPANY = 'Sin compañía asignada'
// Create, modify and deactivate belong to SCRUM-32/33/34; they stay visible but disabled.
const PENDING = '(Pendiente)'

const props = defineProps<{ disabled?: boolean }>()
const { state, sessionExpired, refreshPermissions } = useEmployeeSessionRecovery()
const id = useId()
const searchDraft = ref('')
const appliedSearch = ref('')
const validationError = ref('')
const companyId = ref<number | ''>('')
const pageSize = ref<BranchPageSize>(10)
const page = ref(1)
const result = ref<BranchListResult | null>(null)
const loading = ref(false)
const listError = ref<'forbidden' | 'failed' | ''>('')
const companies = ref<CompanyOption[]>([])
const companiesLoading = ref(false)
const companiesError = ref(false)
const selectedBranchId = ref<number | null>(null)
let listRequest: AbortController | undefined
let companiesRequest: AbortController | undefined

const columns = [
  { key: 'name', label: 'Nombre' },
  { key: 'displayId', label: 'ID Sucursal' },
  { key: 'companyName', label: 'Compañía' },
]
const rows = computed(() =>
  (result.value?.items ?? []).map((branch) => ({
    id: branch.id,
    displayId: formatBranchId(branch.id),
    name: branch.name ?? '',
    companyName: branch.companyName ?? '',
    branch,
  })),
)
const hasFilters = computed(
  () =>
    !!appliedSearch.value ||
    !!searchDraft.value ||
    companyId.value !== '' ||
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
  const request = new AbortController()
  listRequest = request
  loading.value = true
  listError.value = ''
  const query: BranchListQuery = {
    page: page.value,
    pageSize: pageSize.value,
    ...(appliedSearch.value ? { search: appliedSearch.value } : {}),
    ...(companyId.value !== '' ? { companyId: companyId.value } : {}),
  }
  try {
    const data = await getBranches(query, request.signal)
    if (request.signal.aborted || state.disposed) return
    result.value = data
    page.value = data.page
  } catch (error) {
    if (request.signal.aborted || state.disposed) return
    result.value = null
    const status = failed(error)
    if (status === 400)
      validationError.value =
        'La búsqueda o el filtro no son válidos. Revisa los valores e inténtalo de nuevo.'
    else listError.value = status === 403 ? 'forbidden' : 'failed'
  } finally {
    if (listRequest === request) {
      loading.value = false
      listRequest = undefined
    }
  }
}

async function loadCompanies() {
  companiesRequest?.abort()
  const request = new AbortController()
  companiesRequest = request
  companiesLoading.value = true
  companiesError.value = false
  try {
    const data = await getCompanies(request.signal)
    if (!request.signal.aborted && !state.disposed) companies.value = data
  } catch (error) {
    if (request.signal.aborted || state.disposed) return
    failed(error)
    companiesError.value = true
  } finally {
    if (companiesRequest === request) {
      companiesLoading.value = false
      companiesRequest = undefined
    }
  }
}

function search() {
  if (props.disabled) return
  const value = searchDraft.value
  validationError.value = ''
  if (value !== '' && !value.trim())
    validationError.value = 'La búsqueda no puede contener solo espacios.'
  else if (/\p{Cc}/u.test(value))
    validationError.value = 'La búsqueda contiene caracteres no válidos.'
  else if (value.trim().length > 100)
    validationError.value = 'La búsqueda no puede superar 100 caracteres.'
  if (validationError.value) return
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
  validationError.value = ''
  companyId.value = ''
  page.value = 1
  void load()
}
function viewBranch(row: { [key: string]: unknown }) {
  if (typeof row.id === 'number') selectedBranchId.value = row.id
}
function changePage(value: number) {
  if (loading.value || !result.value || value < 1 || value > result.value.totalPages) return
  page.value = value
  void load()
}

void load()
void loadCompanies()

onBeforeUnmount(() => {
  listRequest?.abort()
  companiesRequest?.abort()
})
</script>

<template>
  <section class="preview-content branches-section" aria-labelledby="branches-title">
    <div class="section-heading">
      <h1 id="branches-title">Sucursales</h1>
      <span :title="`Agregar sucursal ${PENDING}`" class="action-hint">
        <button type="button" class="add-user-button" disabled>
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          Agregar Sucursal
        </button>
      </span>
    </div>

    <form class="search-bar" novalidate @submit.prevent="search">
      <div class="search-field">
        <label :for="id + '-search'">Buscar sucursales</label>
        <div class="search-input">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input
            :id="id + '-search'"
            v-model="searchDraft"
            type="search"
            name="search"
            placeholder="Nombre o ID de sucursal"
            :aria-invalid="!!validationError"
            :aria-describedby="validationError ? id + '-validation' : undefined"
          />
        </div>
      </div>
      <button type="submit" class="primary-button" :disabled="disabled">Buscar</button>
      <button type="button" class="secondary-button" :disabled="!hasFilters" @click="clearFilters">
        <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros
      </button>
    </form>
    <p v-if="validationError" :id="id + '-validation'" class="feedback error" role="alert">
      {{ validationError }}
    </p>

    <div class="filters">
      <label
        >Compañía<select
          v-model="companyId"
          name="companyId"
          :disabled="companiesLoading || companiesError"
          @change="filtersChanged"
        >
          <option value="">Todas</option>
          <option v-for="company in companies" :key="company.id" :value="company.id">
            {{ company.name ?? NO_NAME }}
          </option>
        </select></label
      >
      <p v-if="companiesError" class="filter-error" role="alert">
        No se pudieron cargar las compañías.
        <button type="button" class="link-button" @click="loadCompanies">Reintentar</button>
      </p>
    </div>

    <div class="list-content" :aria-busy="loading">
      <LoadingState v-if="loading" message="Cargando sucursales…" />
      <div v-else-if="listError === 'forbidden'" class="state-card error" role="alert">
        <i class="bi bi-shield-lock" aria-hidden="true"></i>
        <h2>No tiene permisos para acceder a esta sección</h2>
      </div>
      <div v-else-if="listError" class="state-card error" role="alert">
        <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
        <h2>No se pudieron cargar las sucursales</h2>
        <p>Ocurrió un error al consultar el servidor. Intenta de nuevo.</p>
        <button type="button" class="secondary-button" @click="load">Reintentar</button>
      </div>
      <template v-else-if="result">
        <p class="result-count" role="status">
          {{ result.total }} {{ result.total === 1 ? 'sucursal' : 'sucursales' }}
        </p>
        <CrudTable v-if="result.items.length" :columns="columns" :rows="rows" caption="Sucursales">
          <template #cell-name="{ value }">
            <span v-if="value">{{ value }}</span>
            <span v-else class="missing">{{ NO_NAME }}</span>
          </template>
          <template #cell-companyName="{ value }">
            <span v-if="value">{{ value }}</span>
            <span v-else class="missing">{{ NO_COMPANY }}</span>
          </template>
          <template #actions="{ row }">
            <div class="branch-actions">
              <span title="Ver" class="action-hint">
                <button type="button" aria-label="Ver sucursal" @click="viewBranch(row)">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
              </span>
              <span :title="`Modificar ${PENDING}`" class="action-hint">
                <button type="button" :aria-label="`Modificar sucursal ${PENDING}`" disabled>
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
              </span>
              <span :title="`Desactivar ${PENDING}`" class="action-hint">
                <button type="button" :aria-label="`Desactivar sucursal ${PENDING}`" disabled>
                  <i class="bi bi-x-circle" aria-hidden="true"></i>
                </button>
              </span>
            </div>
          </template>
        </CrudTable>
        <div v-else class="state-card">
          <i :class="['bi', hasFilters ? 'bi-search' : 'bi-building']" aria-hidden="true"></i>
          <h2>
            {{ hasFilters ? 'No se encontraron sucursales' : 'No hay sucursales registradas' }}
          </h2>
          <p>
            {{
              hasFilters
                ? 'Prueba con otro nombre o ID, o limpia los filtros.'
                : 'Las sucursales aparecerán aquí cuando se registren.'
            }}
          </p>
        </div>
      </template>
    </div>

    <footer v-if="result && !listError" class="pagination-bar">
      <label class="page-size"
        >Mostrar<select v-model="pageSize" name="pageSize" @change="filtersChanged">
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select></label
      >
      <nav aria-label="Paginación de sucursales">
        <button
          type="button"
          class="secondary-button"
          :disabled="loading || result.page <= 1"
          @click="changePage(result.page - 1)"
        >
          <i class="bi bi-arrow-left" aria-hidden="true"></i> Anterior
        </button>
        <span class="current-page" aria-current="page">
          <span class="visually-hidden">Página </span>{{ result.totalPages ? result.page : 0 }}
          <span class="visually-hidden">de {{ result.totalPages }}</span>
        </span>
        <button
          type="button"
          class="secondary-button"
          :disabled="loading || result.page >= result.totalPages"
          @click="changePage(result.page + 1)"
        >
          Siguiente <i class="bi bi-arrow-right" aria-hidden="true"></i>
        </button>
      </nav>
    </footer>
    <BranchDetailDialog
      :branch-id="selectedBranchId"
      @close="selectedBranchId = null"
      @session-expired="sessionExpired"
      @forbidden="refreshPermissions"
    />
  </section>
</template>

<style scoped>
.branches-section {
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
.filters,
.pagination-bar,
.pagination-bar nav {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
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
input {
  width: 100%;
  padding-left: 40px;
}
input[aria-invalid='true'] {
  border-color: var(--error-color);
}
.filters label {
  min-width: min(100%, 220px);
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
.action-hint {
  display: inline-flex;
}
.branch-actions {
  display: flex;
  gap: 4px;
}
.branch-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  min-height: 36px;
  padding: 8px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.125rem;
}
.branch-actions button:disabled {
  pointer-events: none;
}
.branch-actions button:not(:disabled):hover {
  background: var(--surface-hover);
}
.missing {
  color: var(--text-secondary);
  font-style: italic;
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
.page-size {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
  color: var(--text-on-dark-secondary);
}
.page-size select {
  color: var(--text-primary);
}
.current-page {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  font-weight: 600;
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
