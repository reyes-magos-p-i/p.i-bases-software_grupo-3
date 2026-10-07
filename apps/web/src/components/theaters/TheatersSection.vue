<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { isAxiosError } from 'axios'
import { useRouter } from 'vue-router'
import CreateTheaterDialog from './CreateTheaterDialog.vue'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import { createTheater, getTheaterCreationOptions, getTheaters } from '@/services/theater.service'
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
const submissionErrors = ref<string[]>([])
const creationResult = ref('')
const submitting = ref(false)
const theaters = ref<Theater[]>([])
const theatersLoading = ref(false)
const theatersError = ref('')
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
    id: theater.theaterId,
    displayId: `S${theater.theaterId}`,
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
    if (!currentRequest.signal.aborted && !disposed) theaters.value = result
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
    await loadTheaters()
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
        'El resultado no pudo ser confirmado. Verifica si la sala fue creada antes de intentarlo de nuevo.',
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
        @click="open"
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
        <CrudTable :columns="columns" :rows="rows()" :show-actions="false" caption="Salas" />
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

