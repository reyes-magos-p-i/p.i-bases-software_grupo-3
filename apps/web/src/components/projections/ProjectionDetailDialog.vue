<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { isAxiosError } from 'axios'
import ProjectionDialogShell from './ProjectionDialogShell.vue'
import ProjectionPoster from './ProjectionPoster.vue'
import ProjectionStatusBadge from './ProjectionStatusBadge.vue'
import { getProjectionDetail } from '@/services/projection.service'
import type { ProjectionDetail } from '@/types/projection'
import {
  formatPrice,
  formatProjectionDate,
  formatProjectionDuration,
  formatProjectionTime,
  projectionCode,
} from '@/utils/projection-format'

const props = defineProps<{ projectionId: number | null }>()
const emit = defineEmits<{ close: []; sessionExpired: []; forbidden: [] }>()
const shell = useTemplateRef<InstanceType<typeof ProjectionDialogShell>>('shell')
const detail = ref<ProjectionDetail | null>(null)
const loading = ref(false)
const error = ref('')
let request: AbortController | undefined

const minutes = (value: number | null) => (value === null ? 'Sin registrar' : `${value} minutos`)
const fields = computed(() => {
  const item = detail.value
  if (!item) return []
  return [
    { label: 'ID de proyección', value: projectionCode('MF', item.movieFunctionId) },
    { label: 'Estado', value: '', status: item.status },
    { label: 'Sucursal', value: item.branchName },
    { label: 'Sala', value: `Sala ${item.theaterId}` },
    { label: 'Fecha de proyección', value: formatProjectionDate(item.startTime) },
    { label: 'Hora inicio', value: formatProjectionTime(item.startTime) },
    { label: 'Hora fin', value: formatProjectionTime(item.endTime) },
    { label: 'Ocupación de la sala', value: formatProjectionDuration(item.startTime, item.endTime) },
    { label: 'Anuncios', value: minutes(item.advertisementMinutes) },
    { label: 'Duración de la película', value: minutes(item.runningTime) },
    { label: 'Limpieza', value: minutes(item.cleaningMinutes) },
    { label: 'Precio por persona', value: formatPrice(item.price) },
    {
      label: 'Fecha de creación',
      value: `${formatProjectionDate(item.createdAt)} ${formatProjectionTime(item.createdAt)}`,
    },
  ]
})

async function load(id: number) {
  request?.abort()
  const current = new AbortController()
  request = current
  loading.value = true
  error.value = ''
  detail.value = null
  try {
    const result = await getProjectionDetail(id, current.signal)
    if (!current.signal.aborted) detail.value = result
  } catch (failure) {
    if (current.signal.aborted) return
    const status = isAxiosError(failure) ? failure.response?.status : undefined
    if (status === 401) emit('sessionExpired')
    else if (status === 403) {
      error.value = 'No tienes permisos para realizar esta acción.'
      emit('forbidden')
    } else if (status === 404) error.value = 'Esta proyección ya no está disponible.'
    else error.value = 'No se pudo cargar el detalle, intenta de nuevo.'
  } finally {
    if (request === current) {
      loading.value = false
      request = undefined
    }
  }
}

function retry() {
  if (props.projectionId !== null) void load(props.projectionId)
}

watch(
  () => props.projectionId,
  async (id) => {
    if (id === null) {
      request?.abort()
      shell.value?.close()
      return
    }
    await nextTick()
    shell.value?.open()
    void load(id)
  },
  { immediate: true },
)

onBeforeUnmount(() => request?.abort())
</script>

<template>
  <ProjectionDialogShell ref="shell" title="Detalle de proyección" @close="emit('close')">
    <div class="detail-content" :aria-busy="loading">
      <p v-if="loading" class="detail-feedback" role="status">Cargando el detalle…</p>
      <div v-else-if="error" class="detail-feedback detail-error" role="alert">
        {{ error }}
        <button type="button" class="link-button" @click="retry">Reintentar</button>
      </div>
      <div v-else-if="detail" class="detail-body">
        <div class="detail-main">
          <h3 class="detail-title">{{ detail.movieTitle }}</h3>
          <dl class="detail-grid">
            <div v-for="field in fields" :key="field.label" class="detail-field">
              <dt>{{ field.label }}</dt>
              <dd>
                <ProjectionStatusBadge v-if="field.status" :status="field.status" />
                <template v-else>{{ field.value }}</template>
              </dd>
            </div>
          </dl>
        </div>
        <ProjectionPoster :poster-image="detail.posterImage" :title="detail.movieTitle" />
      </div>
    </div>
  </ProjectionDialogShell>
</template>

<style scoped>
.detail-content { min-height: 0; padding: 24px 32px; overflow-y: auto; }
.detail-body { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 32px; align-items: start; }
.detail-title { margin: 0 0 16px; font-size: 1.25rem; font-weight: 700; }
.detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 16px; margin: 0; }
.detail-field { display: grid; gap: 4px; padding: 10px 12px; border-radius: var(--radius-small); background: var(--color-white); box-shadow: 0 1px 3px color-mix(in srgb, var(--color-black) 12%, transparent); }
.detail-field dt { color: var(--color-medium_gray); font-size: .85rem; font-weight: 600; }
.detail-field dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.detail-feedback { margin: 0; padding: 24px; border-radius: var(--radius-medium); background: var(--color-white); }
.detail-error { color: var(--color-error); border-left: 4px solid var(--color-error); }
.link-button { border: 0; color: var(--color-primary); background: transparent; text-decoration: underline; }
@media (max-width: 900px) { .detail-body { grid-template-columns: 1fr; } .detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .detail-content { padding: 20px 16px; } .detail-grid { grid-template-columns: 1fr; } }
</style>
