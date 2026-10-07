<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { isAxiosError } from 'axios'
import { useRouter } from 'vue-router'
import CreateTheaterDialog from './CreateTheaterDialog.vue'
import TheaterDetailDialog from './TheaterDetailDialog.vue'
import DeactivateTheaterDialog from './DeactivateTheaterDialog.vue'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import {
  createTheater,
  getTheaterCreationOptions,
  getTheaters,
  updateTheater,
} from '@/services/theater.service'
import {
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import type { CreateTheaterRequest, Theater, TheaterCreationOptions } from '@/types/theater'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const router = useRouter()
const dialog = useTemplateRef<InstanceType<typeof CreateTheaterDialog>>('dialog')
const resultNotice = useTemplateRef<HTMLElement>('result-notice')
const options = ref<TheaterCreationOptions | null>(null)
const optionsLoading = ref(false)
const optionsError = ref('')
const creationResult = ref('')
const submitting = ref(false)
const theaters = ref<Theater[]>([])
const theatersLoading = ref(false)
const theatersError = ref('')
const selectedTheater = ref<Theater | null>(null)
const editingTheater = ref<Theater | null>(null)
const deactivatingTheater = ref<Theater | null>(null)
const theaterSubmissionErrors = ref<string[]>([])
let request: AbortController | undefined
let theatersRequest: AbortController | undefined
let disposed = false

const columns = [
  { key: 'displayId', label: 'ID' },
  { key: 'branchId', label: 'Sucursal' },
  { key: 'numberOfSeats', label: 'Asientos' },
  { key: 'dimensions', label: 'Dimensiones' },
  { key: 'projectorName', label: 'Proyector' },
  { key: 'status', label: 'Estado' },
]

const rows = () =>
  theaters.value.map((theater) => ({
    ...theater,
    theater,
    id: theater.theaterId,
    displayId: String(theater.theaterId),
    dimensions: `${theater.dimensionX} x ${theater.dimensionY}`,
    status: theater.isActive ? theater.status : 'Inactiva',
  }))

function sessionExpired() {
  invalidateEmployeeSession()
  void router.replace({ path: '/', query: { login: 'employee', reason: 'expired' } })
}

async function refreshPermissions() {
  try {
    const current = await restoreEmployeeSession(true)
    if (!disposed && !current) sessionExpired()
  } catch {
    if (!disposed)
      void router.replace({ path: '/', query: { login: 'employee', reason: 'unavailable' } })
  }
}

async function loadOptions() {
  if (optionsLoading.value || options.value) return
  request = new AbortController()
  optionsLoading.value = true
  optionsError.value = ''
  try {
    const result = await getTheaterCreationOptions(request.signal)
    if (!request.signal.aborted) options.value = result
  } catch (error) {
    if (request.signal.aborted) return
    if (isAxiosError(error) && error.response?.status === 401) sessionExpired()
    else if (isAxiosError(error) && error.response?.status === 403) {
      optionsError.value = 'No tienes permiso para cargar las opciones de salas.'
      void refreshPermissions()
    } else {
      optionsError.value = 'No se pudieron cargar las opciones de salas. Inténtalo nuevamente.'
    }
  } finally {
    optionsLoading.value = false
    request = undefined
  }
}

async function loadTheaters() {
  theatersRequest?.abort()
  const currentRequest = new AbortController()
  theatersRequest = currentRequest
  theatersLoading.value = true
  theatersError.value = ''
  try {
    const result = await getTheaters(currentRequest.signal)
    if (!currentRequest.signal.aborted && !disposed) {
      theaters.value = result.filter((theater) => theater.isActive)
    }
  } catch (error) {
    if (currentRequest.signal.aborted || disposed) return
    if (isAxiosError(error) && error.response?.status === 401) sessionExpired()
    else if (isAxiosError(error) && error.response?.status === 403) {
      theatersError.value = 'No tienes permiso para consultar las salas.'
      void refreshPermissions()
    } else {
      theatersError.value = 'No se pudieron cargar las salas. Inténtalo nuevamente.'
    }
  } finally {
    if (theatersRequest === currentRequest) {
      theatersLoading.value = false
      theatersRequest = undefined
    }
  }
}

function open(theater: Theater | null = null) {
  if (props.disabled || optionsLoading.value) return
  editingTheater.value = theater
  theaterSubmissionErrors.value = []
  dialog.value?.open()
  void loadOptions()
}

function openCreate() {
  open()
}

async function submit(data: CreateTheaterRequest) {
  if (submitting.value || props.disabled) return
  submitting.value = true
  emit('busy', true)
  theaterSubmissionErrors.value = []
  creationResult.value = ''
  try {
    const theater = editingTheater.value
      ? await updateTheater(editingTheater.value.theaterId, data)
      : await createTheater(data)
    if (disposed) return
    await loadTheaters()
    creationResult.value = editingTheater.value
      ? `Sala ${theater.theaterId} modificada exitosamente.`
      : `Sala ${theater.theaterId} creada exitosamente.`
    theaterSubmissionErrors.value = []
    editingTheater.value = null
    dialog.value?.complete()
    await nextTick()
    resultNotice.value?.focus()
  } catch (error) {
    if (disposed) return
    if (isAxiosError(error) && error.response?.status === 401) sessionExpired()
    else if (isAxiosError(error) && error.response?.status === 403) {
      theaterSubmissionErrors.value = [
        `No tienes permiso para ${editingTheater.value ? 'modificar' : 'crear'} salas.`,
      ]
      void refreshPermissions()
    } else if (isAxiosError(error) && error.response?.status === 400) {
      theaterSubmissionErrors.value = ['Revisa los datos de la sala e inténtalo nuevamente.']
    } else {
      theaterSubmissionErrors.value = [
        `El resultado no pudo ser confirmado. Verifica si la sala fue ${editingTheater.value ? 'modificada' : 'creada'} antes de intentarlo de nuevo.`,
      ]
    }
  } finally {
    submitting.value = false
    emit('busy', false)
  }
}

function retryOptions() {
  void loadOptions()
}

function retryTheaters() {
  void loadTheaters()
}

function editTheater(row: { theater?: Theater }) {
  if (row.theater) open(row.theater)
}

function viewTheater(row: { theater?: Theater }) {
  if (row.theater) selectedTheater.value = row.theater
}

function deactivateTheater(row: { theater?: Theater }) {
  if (row.theater) deactivatingTheater.value = row.theater
}

function theaterDeactivated() {
  deactivatingTheater.value = null
  creationResult.value = 'La sala fue desactivada exitosamente.'
  void loadTheaters()
}

void loadTheaters()

onBeforeUnmount(() => {
  disposed = true
  request?.abort()
  theatersRequest?.abort()
})
</script>

<template>
  <section class="preview-content" aria-live="polite" aria-atomic="true">
    <div class="section-heading">
      <h1>Salas</h1>
      <button
        type="button"
        class="add-user-button"
        :disabled="disabled || submitting"
        @click="openCreate"
      >
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        Crear sala
      </button>
    </div>
    <div class="list-content" :aria-busy="theatersLoading">
      <p v-if="theatersLoading" class="feedback" role="status">Cargando salas…</p>
      <div v-else-if="theatersError" class="feedback error" role="alert">
        {{ theatersError }}
        <button type="button" class="secondary-button" @click="retryTheaters">Reintentar</button>
      </div>
      <template v-else-if="theaters.length">
        <p class="result-count" role="status">
          {{ theaters.length }} {{ theaters.length === 1 ? 'sala registrada' : 'salas registradas' }}
        </p>
        <CrudTable :columns="columns" :rows="rows()" caption="Salas">
          <template #actions="{ row }">
            <div class="user-actions">
              <span title="Ver" class="action-hint">
                <button type="button" aria-label="Ver sala" @click="viewTheater(row)">
                  <i class="bi bi-eye" aria-hidden="true"></i>
                </button>
              </span>
              <span title="Modificar" class="action-hint">
                <button type="button" aria-label="Modificar sala" @click="editTheater(row)">
                  <i class="bi bi-pencil-square" aria-hidden="true"></i>
                </button>
              </span>
              <span title="Desactivar" class="action-hint">
                <button
                  type="button"
                  aria-label="Desactivar sala"
                  @click="deactivateTheater(row)"
                >
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                </button>
              </span>
            </div>
          </template>
        </CrudTable>
      </template>
      <div v-else class="empty-state">
        <i class="bi bi-display" aria-hidden="true"></i>
        <h2>No hay salas registradas</h2>
        <p>Las salas aparecerán aquí cuando se registren.</p>
      </div>
    </div>
    <p
      v-if="creationResult"
      ref="result-notice"
      class="creation-result"
      role="status"
      tabindex="-1"
    >
      {{ creationResult }}
    </p>
    <CreateTheaterDialog
      ref="dialog"
      :theater="editingTheater"
      :projectors="options?.projectors"
      :cinemas="options?.cinemas"
      :options-loading="optionsLoading"
      :options-error="optionsError"
      :submitting="submitting"
      :submission-errors="theaterSubmissionErrors"
      @retry-options="retryOptions"
      @submit="submit"
    />
    <TheaterDetailDialog :theater="selectedTheater" @close="selectedTheater = null" />
    <DeactivateTheaterDialog
      :theater="deactivatingTheater"
      @close="deactivatingTheater = null"
      @deactivated="theaterDeactivated"
      @session-expired="sessionExpired"
    />
  </section>
</template>

<style scoped>
.user-actions {
  display: flex;
  gap: 4px;
}
.user-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  width: 36px;
  min-height: 36px;
  padding: 8px;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-size: 1.125rem;
  text-decoration: none;
}
.user-actions button:not(:disabled):hover {
  background: var(--color-light_gray);
}
.action-hint {
  display: inline-flex;
}
</style>

