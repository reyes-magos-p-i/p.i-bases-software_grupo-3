<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { isAxiosError } from 'axios'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import UserDetailDialog from '@/components/users/UserDetailDialog.vue'
import EditUserDialog from '@/components/users/EditUserDialog.vue'
import DeactivateUserDialog from '@/components/users/DeactivateUserDialog.vue'
import { getEmployeeListOptions, getUsers } from '@/services/user.service'
import type { BranchOption, UserListQuery, UserListResult, UserRole } from '@/types/user'
import type { UserDetailSelection, UpdatedUser } from '@/types/user'
import type { UserDeactivationSelection } from '@/types/user'

const props = defineProps<{
  section: 'clients' | 'employees'
  role: UserRole
  currentUserId?: number
}>()
const emit = defineEmits<{
  'session-expired': []
  forbidden: []
  'user-updated': [selection: UserDetailSelection, user: UpdatedUser]
}>()
const id = useId()
const filterContainer = ref<HTMLElement | null>(null)
const selectedUser = ref<UserDetailSelection | null>(null)
const editedUser = ref<UserDetailSelection | null>(null)
const deactivatedUser = ref<UserDeactivationSelection | null>(null)
const updateNotice = ref('')
const updateFeedback = ref<HTMLElement | null>(null)
const searchDraft = ref('')
const appliedSearch = ref('')
const validationError = ref('')
const listError = ref('')
const loading = ref(false)
const result = ref<UserListResult | null>(null)
const page = ref(1)
const sortBy = ref('id')
const sortDirection = ref<'asc' | 'desc'>('asc')
const selectedRoles = ref<('EMPLOYEE' | 'ADMINISTRATOR')[]>([])
const selectedBranches = ref<number[]>([])
const branches = ref<BranchOption[]>([])
const optionsError = ref('')
const optionsLoading = ref(false)
let listRequest: AbortController | undefined
let optionsRequest: AbortController | undefined
let disposed = false
function closeFilters(event: PointerEvent | KeyboardEvent) {
  if ('key' in event && event.key !== 'Escape') return
  const container = filterContainer.value
  if (!container) return
  for (const picker of container.querySelectorAll<HTMLDetailsElement>('details[open]')) {
    if (
      event.type === 'pointerdown' &&
      event.target instanceof Node &&
      picker.contains(event.target)
    )
      continue
    picker.open = false
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', closeFilters)
  document.addEventListener('keydown', closeFilters)
})
const isEmployeeList = computed(() => props.section === 'employees')
const canRead = computed(
  () => props.role === 'ADMINISTRATOR' || (props.role === 'EMPLOYEE' && !isEmployeeList.value),
)
const columns = computed(() => [
  { key: 'displayId', label: 'ID' },
  { key: 'name', label: 'Nombre completo' },
  { key: 'email', label: 'Correo electrónico' },
  { key: 'phoneNumber', label: 'Teléfono' },
  ...(isEmployeeList.value
    ? [
        { key: 'role', label: 'Rol' },
        { key: 'branchName', label: 'Sucursal' },
        { key: 'hireDate', label: 'Contratación' },
      ]
    : []),
  { key: 'createdAt', label: 'Registro' },
])
const dateFormat = new Intl.DateTimeFormat('es-CR', {
  timeZone: 'America/Costa_Rica',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
function formatRegistration(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : 'Desconocida'
}
const rows = computed(() =>
  (result.value?.items ?? []).map((user) => ({
    ...user,
    displayId: `${'role' in user ? (user.role === 'ADMINISTRATOR' ? 'ADM' : 'EMP') : 'CL'}${user.id}`,
    phoneNumber: user.phoneNumber ?? 'Sin registrar',
    createdAt: formatRegistration(user.createdAt),
    ...('hireDate' in user
      ? {
          hireDate: user.hireDate ? user.hireDate.split('-').reverse().join('/') : 'Desconocida',
          role: user.role === 'ADMINISTRATOR' ? 'Administrador' : 'Empleado',
        }
      : {}),
  })),
)
const hasFilters = computed(
  () =>
    !!appliedSearch.value ||
    !!searchDraft.value ||
    selectedRoles.value.length > 0 ||
    selectedBranches.value.length > 0 ||
    !!validationError.value,
)

function handlePermissions(error: unknown) {
  if (!isAxiosError(error)) return
  if (error.response?.status === 401) emit('session-expired')
  if (error.response?.status === 403) emit('forbidden')
}

async function load() {
  listRequest?.abort()
  result.value = null
  listError.value = ''
  if (!canRead.value || validationError.value) {
    loading.value = false
    return
  }
  const request = new AbortController()
  listRequest = request
  loading.value = true
  const query: UserListQuery = {
    page: page.value,
    pageSize: 10,
    sortBy: sortBy.value,
    sortDirection: sortDirection.value,
    ...(appliedSearch.value ? { search: appliedSearch.value } : {}),
    ...(isEmployeeList.value && selectedRoles.value.length
      ? { role: [...selectedRoles.value] }
      : {}),
    ...(isEmployeeList.value && selectedBranches.value.length
      ? { branchId: [...selectedBranches.value] }
      : {}),
  }
  try {
    const data = await getUsers(props.section, query, request.signal)
    if (request.signal.aborted || disposed) return
    result.value = data
    page.value = data.page
  } catch (error) {
    if (request.signal.aborted || disposed) return
    handlePermissions(error)
    if (isAxiosError(error) && error.response?.status === 400) {
      validationError.value =
        'La búsqueda o los filtros no son válidos. Revisa los valores e inténtalo de nuevo.'
    } else if (isAxiosError(error) && error.response?.status === 403) {
      listError.value = 'No tienes permiso para consultar esta lista.'
    } else if (isAxiosError(error) && error.response?.status === 401) {
      listError.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
    } else {
      listError.value = 'No se pudo cargar la lista. Comprueba la conexión y vuelve a intentarlo.'
    }
  } finally {
    if (listRequest === request) {
      loading.value = false
      listRequest = undefined
    }
  }
}

async function loadOptions() {
  optionsRequest?.abort()
  optionsError.value = ''
  if (!isEmployeeList.value || !canRead.value) {
    optionsLoading.value = false
    return
  }
  const request = new AbortController()
  optionsRequest = request
  optionsLoading.value = true
  try {
    const data = await getEmployeeListOptions(request.signal)
    if (!request.signal.aborted && !disposed) branches.value = data.branches
  } catch (error) {
    if (request.signal.aborted || disposed) return
    handlePermissions(error)
    optionsError.value = 'No se pudieron cargar las sucursales.'
  } finally {
    if (optionsRequest === request) {
      optionsLoading.value = false
      optionsRequest = undefined
    }
  }
}

function search() {
  const value = searchDraft.value
  validationError.value = ''
  if (value !== '' && !value.trim())
    validationError.value =
      'Escribe un nombre o apellido; la búsqueda no puede contener solo espacios.'
  else if (/[\uD800-\uDFFF\p{Cc}]/u.test(value))
    validationError.value = 'La búsqueda contiene caracteres no válidos.'
  else if (new TextEncoder().encode(value).length > 400)
    validationError.value = 'La búsqueda no puede superar 400 bytes en UTF-8.'
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
  selectedRoles.value = []
  selectedBranches.value = []
  page.value = 1
  void load()
}
function changePage(value: number) {
  if (loading.value || !result.value || value < 1 || value > result.value.totalPages) return
  page.value = value
  void load()
}
function refresh() {
  void load()
}
function viewUser(row: { [key: string]: unknown }) {
  if (!canRead.value || typeof row.id !== 'number') return
  selectedUser.value = { section: props.section, id: row.id }
}
function editUser(row: { [key: string]: unknown }) {
  if (!canRead.value || typeof row.id !== 'number') return
  updateNotice.value = ''
  editedUser.value = { section: props.section, id: row.id }
}
function userUpdated(selection: UserDetailSelection, user: UpdatedUser) {
  editedUser.value = null
  updateNotice.value = 'El usuario fue modificado exitosamente.'
  emit('user-updated', selection, user)
  refresh()
  void nextTick(() => updateFeedback.value?.focus())
}
function canDeactivate(row: { [key: string]: unknown }) {
  return canRead.value && !(props.section === 'employees' && row.id === props.currentUserId)
}
function deactivateSelection(row: { [key: string]: unknown }) {
  if (
    !canDeactivate(row) ||
    typeof row.id !== 'number' ||
    typeof row.name !== 'string' ||
    typeof row.displayId !== 'string'
  )
    return
  updateNotice.value = ''
  deactivatedUser.value = {
    section: props.section,
    id: row.id,
    name: row.name,
    displayId: row.displayId,
  }
}
function userDeactivated() {
  deactivatedUser.value = null
  updateNotice.value = 'El usuario fue desactivado exitosamente.'
  refresh()
  void nextTick(() => updateFeedback.value?.focus())
}
watch(
  () => [props.section, props.role],
  () => {
    selectedUser.value = null
    editedUser.value = null
    deactivatedUser.value = null
    searchDraft.value = ''
    appliedSearch.value = ''
    validationError.value = ''
    selectedRoles.value = []
    selectedBranches.value = []
    sortBy.value = 'id'
    page.value = 1
    branches.value = []
    void load()
    void loadOptions()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeFilters)
  document.removeEventListener('keydown', closeFilters)
  disposed = true
  listRequest?.abort()
  optionsRequest?.abort()
})
defineExpose({ refresh })
</script>

<template>
  <div class="user-list-panel">
    <p v-if="updateNotice" ref="updateFeedback" class="feedback" role="status" tabindex="-1">
      {{ updateNotice }}
    </p>
    <form class="search-bar" novalidate @submit.prevent="search">
      <div class="search-field">
        <label :for="id + '-search'">Buscar {{ isEmployeeList ? 'empleados' : 'clientes' }}</label>
        <div class="search-input">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input
            :id="id + '-search'"
            v-model="searchDraft"
            type="search"
            name="search"
            placeholder="Nombre, apellidos, correo, ID o teléfono"
            :aria-invalid="!!validationError"
            :aria-describedby="validationError ? id + '-validation' : undefined"
          />
        </div>
      </div>
      <button type="submit" class="primary-button">Buscar</button>
      <button type="button" class="secondary-button" :disabled="!hasFilters" @click="clearFilters">
        <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros
      </button>
    </form>
    <p v-if="validationError" :id="id + '-validation'" class="feedback error" role="alert">
      {{ validationError }}
    </p>
    <div ref="filterContainer" class="filters">
      <details v-if="isEmployeeList" class="filter-picker">
        <summary>
          Rol
          <span>{{
            selectedRoles.length ? `${selectedRoles.length} seleccionados` : 'Todos'
          }}</span>
        </summary>
        <fieldset class="checkbox-options">
          <legend class="visually-hidden">Filtrar por roles</legend>
          <label
            ><input
              v-model="selectedRoles"
              type="checkbox"
              name="role"
              value="EMPLOYEE"
              @change="filtersChanged"
            />Empleado</label
          >
          <label
            ><input
              v-model="selectedRoles"
              type="checkbox"
              name="role"
              value="ADMINISTRATOR"
              @change="filtersChanged"
            />Administrador</label
          >
        </fieldset>
      </details>
      <details v-if="isEmployeeList" class="filter-picker">
        <summary>
          Sucursal
          <span>{{
            selectedBranches.length ? `${selectedBranches.length} seleccionadas` : 'Todas'
          }}</span>
        </summary>
        <fieldset
          class="checkbox-options"
          name="branches"
          :disabled="optionsLoading || !!optionsError"
        >
          <legend class="visually-hidden">Filtrar por sucursales</legend>
          <p v-if="optionsLoading" role="status">Cargando sucursales…</p>
          <p v-else-if="optionsError">Sucursales no disponibles.</p>
          <p v-else-if="!branches.length">No hay sucursales registradas.</p>
          <label v-for="branch in branches" :key="branch.id"
            ><input
              v-model="selectedBranches"
              type="checkbox"
              name="branchId"
              :value="branch.id"
              @change="filtersChanged"
            />{{ branch.label }}</label
          >
        </fieldset>
      </details>
      <label
        >Ordenar por<select v-model="sortBy" name="sortBy" @change="filtersChanged">
          <option value="id">ID</option>
          <option value="name">Nombre completo</option>
          <option value="email">Correo electrónico</option>
          <option value="createdAt">Fecha de registro</option>
          <template v-if="isEmployeeList"
            ><option value="role">Rol</option>
            <option value="branch">Sucursal</option>
            <option value="hireDate">Fecha de contratación</option></template
          >
        </select></label
      >
      <label
        >Orden<select v-model="sortDirection" name="sortDirection" @change="filtersChanged">
          <option value="asc">Ascendente</option>
          <option value="desc">Descendente</option>
        </select></label
      >
    </div>
    <div v-if="optionsError" class="feedback error" role="alert">
      {{ optionsError }}
      <button type="button" class="secondary-button" @click="loadOptions">
        Reintentar sucursales
      </button>
    </div>
    <div class="list-content" :aria-busy="loading">
      <p v-if="loading" class="feedback" role="status">
        Cargando {{ isEmployeeList ? 'empleados' : 'clientes' }}…
      </p>
      <div v-else-if="listError" class="feedback error" role="alert">
        {{ listError }}
        <button type="button" class="secondary-button" @click="load">Reintentar</button>
      </div>
      <template v-else-if="result">
        <p class="result-count" role="status">
          {{ result.total }} {{ result.total === 1 ? 'resultado' : 'resultados'
          }}<span v-if="appliedSearch"> para «{{ appliedSearch }}»</span>
        </p>
        <CrudTable
          v-if="result.items.length"
          :columns="columns"
          :rows="rows"
          :caption="isEmployeeList ? 'Empleados' : 'Clientes'"
        >
          <template #actions="{ row }">
            <div class="user-actions">
              <span title="Ver" class="action-hint">
                <button type="button" aria-label="Ver" @click="viewUser(row)">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
              </span>
              <span title="Modificar" class="action-hint">
                <button type="button" aria-label="Modificar" @click="editUser(row)">
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
              </span>
              <span
                :title="canDeactivate(row) ? 'Desactivar' : 'No puedes desactivar tu propia cuenta'"
                class="action-hint"
              >
                <button
                  type="button"
                  :disabled="!canDeactivate(row)"
                  aria-label="Desactivar"
                  @click="deactivateSelection(row)"
                >
                  <i class="bi bi-person-slash" aria-hidden="true"></i>
                </button>
              </span>
            </div>
          </template>
        </CrudTable>
        <div v-else class="empty-state">
          <i class="bi bi-people" aria-hidden="true"></i>
          <h2>{{ hasFilters ? 'No hay coincidencias' : 'No hay usuarios registrados' }}</h2>
          <p>
            {{
              hasFilters
                ? 'Prueba otro nombre o apellido, o limpia los filtros.'
                : 'Los usuarios aparecerán aquí cuando se registren.'
            }}
          </p>
        </div>
        <footer class="pagination-bar">
          <nav aria-label="Paginación de usuarios">
            <button
              type="button"
              class="secondary-button"
              aria-label="Página anterior"
              title="Página anterior"
              :disabled="result.page <= 1"
              @click="changePage(result.page - 1)"
            >
              <i class="bi bi-chevron-left" aria-hidden="true"></i></button
            ><span>Página {{ result.totalPages ? result.page : 0 }} de {{ result.totalPages }}</span
            ><button
              type="button"
              class="secondary-button"
              aria-label="Página siguiente"
              title="Página siguiente"
              :disabled="result.page >= result.totalPages"
              @click="changePage(result.page + 1)"
            >
              <i class="bi bi-chevron-right" aria-hidden="true"></i>
            </button>
          </nav>
        </footer>
      </template>
    </div>
    <UserDetailDialog
      :selection="selectedUser"
      @close="selectedUser = null"
      @session-expired="emit('session-expired')"
      @forbidden="emit('forbidden')"
    />
    <EditUserDialog
      :selection="editedUser"
      @close="editedUser = null"
      @updated="userUpdated"
      @session-expired="emit('session-expired')"
      @forbidden="emit('forbidden')"
    />
    <DeactivateUserDialog
      :selection="deactivatedUser"
      @close="deactivatedUser = null"
      @deactivated="userDeactivated"
      @session-expired="emit('session-expired')"
      @forbidden="emit('forbidden')"
    />
  </div>
</template>

<style scoped>
.user-list-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: 20px;
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
  flex: 1;
  min-width: 150px;
}
.filters select,
.filter-picker summary {
  box-sizing: border-box;
  height: 44px;
  line-height: 20px;
  padding: 11px 12px;
}
.filter-picker {
  position: relative;
  flex: 1;
  min-width: 190px;
  align-self: end;
}
.filter-picker summary {
  min-height: 44px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}
.filter-picker summary span {
  margin-left: 8px;
  color: var(--text-secondary);
  font-weight: 400;
}
.filter-picker summary:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.checkbox-options {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 2;
  min-width: 190px;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  box-shadow: 0 4px 12px var(--shadow-color);
  color: var(--text-primary);
}
.filter-picker[open] .checkbox-options {
  animation: filter-open 160ms ease-out;
}
@keyframes filter-open {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .filter-picker[open] .checkbox-options {
    animation: none;
  }
}
.checkbox-options label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px;
  font-weight: 400;
  cursor: pointer;
}
.checkbox-options input {
  width: 18px;
  min-height: 18px;
  height: 18px;
  padding: 0;
  flex-shrink: 0;
  accent-color: var(--primary-color);
}
.checkbox-options p {
  margin: 8px;
  font-size: 0.875rem;
}
.user-actions {
  display: flex;
  gap: 4px;
}
.user-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  text-decoration: none;
  justify-content: center;
  width: 36px;
  min-height: 36px;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  font-size: 1.125rem;
}
.user-actions button:disabled {
  pointer-events: none;
}
.user-actions button:not(:disabled):hover {
  background: var(--surface-hover);
}
.action-hint {
  display: inline-flex;
}
:deep(.crud-table th:first-child),
:deep(.crud-table td:first-child) {
  min-width: 100px;
  white-space: nowrap;
  overflow-wrap: normal;
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
  background: var(--content-background);
  color: var(--button-secondary-text);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
input:focus-visible,
select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.feedback,
.empty-state {
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
  font-size: 0.875rem;
  color: var(--text-on-dark-secondary);
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
.pagination-bar nav {
  align-items: center;
  justify-content: center;
}
@media (max-width: 600px) {
  .search-bar .primary-button,
  .search-bar .secondary-button {
    flex: 1;
  }
}
</style>
