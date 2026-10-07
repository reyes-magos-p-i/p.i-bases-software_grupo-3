<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { isAxiosError } from 'axios'
import ProjectionFormDialog from './ProjectionFormDialog.vue'
import ProjectionListPanel from './ProjectionListPanel.vue'
import { useEmployeeSessionRecovery } from '@/composables/useEmployeeSessionRecovery'
import { createProjections, getProjectionSchedulingOptions } from '@/services/projection.service'
import type {
  CreateProjectionRequest,
  ProjectionApiError,
  ProjectionSchedulingOptions,
} from '@/types/projection'

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
let request: AbortController | undefined

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
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 401) sessionExpired()
    else if (status === 403) {
      optionsError.value = 'No tienes permisos para realizar esta acción.'
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
  dialog.value?.open()
  void loadOptions()
}

function describeCreation(count: number, status: string) {
  const subject = count === 1 ? 'Se creó 1 proyección.' : `Se crearon ${count} proyecciones.`
  return status === 'INACTIVE'
    ? `${subject} Está en estado inactiva: no será visible para los Clientes hasta activarla.`
    : subject
}

async function submit(data: CreateProjectionRequest) {
  if (submitting.value || props.disabled) return
  submitting.value = true
  emit('busy', true)
  submissionErrors.value = []
  creationResult.value = ''
  try {
    const created = await createProjections(data)
    if (state.disposed) return
    creationResult.value = describeCreation(created.projections.length, created.status)
    dialog.value?.complete()
    list.value?.refresh()
    await nextTick()
    resultNotice.value?.focus()
  } catch (error) {
    if (state.disposed) return
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 401) sessionExpired()
    else if (status === 403) {
      submissionErrors.value = ['No tienes permisos para realizar esta acción.']
      void refreshPermissions()
    } else if (status === 400 || status === 409) {
      const messages = serverMessages(error)
      submissionErrors.value = messages.length
        ? messages
        : ['Revisa los datos de la proyección e inténtalo nuevamente.']
    } else {
      submissionErrors.value = ['No se pudo crear la proyección, intenta de nuevo.']
    }
  } finally {
    submitting.value = false
    emit('busy', false)
  }
}

onBeforeUnmount(() => request?.abort())
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
    <ProjectionListPanel
      ref="list"
      @session-expired="sessionExpired"
      @forbidden="refreshPermissions"
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
    />
  </section>
</template>
