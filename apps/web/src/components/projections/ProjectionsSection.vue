<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { isAxiosError } from 'axios'
import ProjectionFormDialog from './ProjectionFormDialog.vue'
import ProjectionListPanel from './ProjectionListPanel.vue'
import { useEmployeeSessionRecovery } from '@/composables/useEmployeeSessionRecovery'
import {
  createProjections,
  getProjectionDetail,
  getProjectionSchedulingOptions,
  updateProjection,
} from '@/services/projection.service'
import type {
  CreateProjectionRequest,
  ProjectionApiError,
  ProjectionSchedulingOptions,
  UpdateProjectionRequest,
} from '@/types/projection'
import { projectionCode } from '@/utils/projection-format'

const PERMISSION_DENIED = 'No tienes permisos para realizar esta acción.'
const NOT_AVAILABLE = 'Esta proyección ya no está disponible.'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const { state, sessionExpired, refreshPermissions } = useEmployeeSessionRecovery()
const dialog = useTemplateRef<InstanceType<typeof ProjectionFormDialog>>('dialog')
const list = useTemplateRef<InstanceType<typeof ProjectionListPanel>>('list')
const resultNotice = useTemplateRef<HTMLElement>('result-notice')
const options = ref<ProjectionSchedulingOptions | null>(null)
const optionsLoading = ref(false)
const optionsError = ref('')
const submissionErrors = ref<string[]>([])
const creationResult = ref('')
const submitting = ref(false)
/** Projection open in the form for modification; null while creating. */
const editingId = ref<number | null>(null)
const editLoading = ref(false)
const editError = ref('')
let request: AbortController | undefined
let editRequest: AbortController | undefined

const statusOf = (error: unknown) => (isAxiosError(error) ? error.response?.status : undefined)

function serverMessages(error: unknown) {
  const message = isAxiosError<ProjectionApiError>(error) ? error.response?.data?.message : undefined
  const messages = Array.isArray(message) ? message : [message]
  return messages.filter((item): item is string => typeof item === 'string' && !!item.trim())
}

async function loadOptions() {
  if (optionsLoading.value || options.value) return
  request = new AbortController()
  optionsLoading.value = true
  optionsError.value = ''
  try {
    const result = await getProjectionSchedulingOptions(request.signal)
    if (!request.signal.aborted) options.value = result
  } catch (error) {
    if (request.signal.aborted) return
    const status = statusOf(error)
    if (status === 401) sessionExpired()
    else if (status === 403) {
      optionsError.value = PERMISSION_DENIED
      void refreshPermissions()
    } else {
      optionsError.value = 'No se pudieron cargar las sucursales y salas. Inténtalo nuevamente.'
    }
  } finally {
    optionsLoading.value = false
    request = undefined
  }
}

function open() {
  if (props.disabled) return
  editingId.value = null
  submissionErrors.value = []
  dialog.value?.open()
  void loadOptions()
}

async function edit(id: number) {
  if (props.disabled || submitting.value) return
  editRequest?.abort()
  const current = new AbortController()
  editRequest = current
  editLoading.value = true
  editError.value = ''
  creationResult.value = ''
  void loadOptions()
  try {
    const detail = await getProjectionDetail(id, current.signal)
    if (current.signal.aborted) return
    editingId.value = id
    submissionErrors.value = []
    dialog.value?.edit(detail)
  } catch (error) {
    if (current.signal.aborted) return
    const status = statusOf(error)
    if (status === 401) sessionExpired()
    else if (status === 403) {
      editError.value = PERMISSION_DENIED
      void refreshPermissions()
    } else if (status === 404) {
      editError.value = NOT_AVAILABLE
      list.value?.refresh()
    } else editError.value = 'No se pudo cargar el detalle, intenta de nuevo.'
  } finally {
    if (editRequest === current) {
      editLoading.value = false
      editRequest = undefined
    }
  }
}

function describeCreation(count: number, status: string) {
  const subject = count === 1 ? 'Se creó 1 proyección.' : `Se crearon ${count} proyecciones.`
  return status === 'INACTIVE'
    ? `${subject} Está en estado inactiva: no será visible para los Clientes hasta activarla.`
    : subject
}

// Shared by creation and modification: on failure the form stays open with the
// entered data and the reason; on success it closes and the list refreshes.
async function persist<T>(action: () => Promise<T>, describe: (result: T) => string, failure: string) {
  if (submitting.value || props.disabled) return
  submitting.value = true
  emit('busy', true)
  submissionErrors.value = []
  creationResult.value = ''
  try {
    const result = await action()
    if (state.disposed) return
    creationResult.value = describe(result)
    dialog.value?.complete()
    list.value?.refresh()
    await nextTick()
    resultNotice.value?.focus()
  } catch (error) {
    if (state.disposed) return
    const status = statusOf(error)
    if (status === 401) sessionExpired()
    else if (status === 403) {
      submissionErrors.value = [PERMISSION_DENIED]
      void refreshPermissions()
    } else if (status === 404) {
      submissionErrors.value = [NOT_AVAILABLE]
      list.value?.refresh()
    } else if (status === 400 || status === 409) {
      const messages = serverMessages(error)
      submissionErrors.value = messages.length
        ? messages
        : ['Revisa los datos de la proyección e inténtalo nuevamente.']
    } else {
      submissionErrors.value = [failure]
    }
  } finally {
    submitting.value = false
    emit('busy', false)
  }
}

function submit(data: CreateProjectionRequest) {
  void persist(
    () => createProjections(data),
    (created) => describeCreation(created.projections.length, created.status),
    'No se pudo crear la proyección, intenta de nuevo.',
  )
}

function save(data: UpdateProjectionRequest) {
  const id = editingId.value
  if (id === null) return
  void persist(
    () => updateProjection(id, data),
    (updated) =>
      `Se guardaron los cambios de la proyección ${projectionCode('MF', updated.movieFunctionId)}.`,
    'No se pudieron guardar los cambios, intenta de nuevo.',
  )
}

onBeforeUnmount(() => {
  request?.abort()
  editRequest?.abort()
})
</script>

<template>
  <section class="preview-content" aria-live="polite" aria-atomic="true">
    <div class="section-heading">
      <h1>Proyecciones</h1>
      <button
        type="button"
        class="add-user-button"
        :disabled="disabled || submitting"
        aria-haspopup="dialog"
        @click="open"
      >
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        Agregar Proyección
      </button>
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
    <p v-if="editLoading" class="edit-feedback" role="status">Cargando la proyección…</p>
    <p v-else-if="editError" class="edit-feedback edit-error" role="alert">{{ editError }}</p>
    <ProjectionListPanel
      ref="list"
      @session-expired="sessionExpired"
      @forbidden="refreshPermissions"
      @edit="edit"
    />
    <ProjectionFormDialog
      ref="dialog"
      :cinemas="options?.cinemas"
      :theaters="options?.theaters"
      :default-price="options?.defaultTicketPrice"
      :options-loading="optionsLoading"
      :options-error="optionsError"
      :submitting="submitting"
      :submission-errors="submissionErrors"
      @retry-options="loadOptions"
      @session-expired="sessionExpired"
      @submit="submit"
      @save="save"
    />
  </section>
</template>

<style scoped>
.edit-feedback { margin: 0 0 16px; padding: 12px 16px; border-radius: var(--radius-medium); background: var(--color-white); }
.edit-error { color: var(--color-error); border-left: 4px solid var(--color-error); }
</style>
