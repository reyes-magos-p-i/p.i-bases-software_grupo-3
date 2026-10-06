<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { isAxiosError } from 'axios'
import { useRouter } from 'vue-router'
import CreateTheaterDialog from './CreateTheaterDialog.vue'
import { createTheater, getTheaterCreationOptions } from '@/services/theater.service'
import {
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import type { CreateTheaterRequest, TheaterCreationOptions } from '@/types/theater'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const router = useRouter()
const dialog = useTemplateRef<InstanceType<typeof CreateTheaterDialog>>('dialog')
const resultNotice = useTemplateRef<HTMLElement>('result-notice')
const options = ref<TheaterCreationOptions | null>(null)
const optionsLoading = ref(false)
const optionsError = ref('')
const submissionErrors = ref<string[]>([])
const creationResult = ref('')
const submitting = ref(false)
let request: AbortController | undefined
let disposed = false

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

function open() {
  if (props.disabled || optionsLoading.value) return
  dialog.value?.open()
  void loadOptions()
}

async function submit(data: CreateTheaterRequest) {
  if (submitting.value || props.disabled) return
  submitting.value = true
  emit('busy', true)
  submissionErrors.value = []
  creationResult.value = ''
  try {
    const theater = await createTheater(data)
    if (disposed) return
    creationResult.value = `Sala ${theater.theaterId} creada exitosamente.`
    dialog.value?.complete()
    await nextTick()
    resultNotice.value?.focus()
  } catch (error) {
    if (disposed) return
    if (isAxiosError(error) && error.response?.status === 401) sessionExpired()
    else if (isAxiosError(error) && error.response?.status === 403) {
      submissionErrors.value = ['No tienes permiso para crear salas.']
      void refreshPermissions()
    } else if (isAxiosError(error) && error.response?.status === 400) {
      submissionErrors.value = ['Revisa los datos de la sala e inténtalo nuevamente.']
    } else {
      submissionErrors.value = [
        'No se pudo crear la sala. Comprueba la conexión e inténtalo nuevamente.',
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

onBeforeUnmount(() => {
  disposed = true
  request?.abort()
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
        @click="open"
      >
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        Crear sala
      </button>
    </div>
    <div class="preview-placeholder">
      <h2>Sección en preparación</h2>
      <p>El contenido de esta sección se incorporará en próximos incrementos.</p>
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
      :projectors="options?.projectors"
      :cinemas="options?.cinemas"
      :options-loading="optionsLoading"
      :options-error="optionsError"
      :submitting="submitting"
      :submission-errors="submissionErrors"
      @retry-options="retryOptions"
      @submit="submit"
    />
  </section>
</template>

