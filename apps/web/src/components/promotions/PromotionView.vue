<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { isAxiosError } from 'axios'
import LoadingState from '@/components/common/LoadingState.vue'
import ProjectionDialogShell from '@/components/projections/ProjectionDialogShell.vue'
import { getPromotion } from '@/services/promotion.service'
import { getPromotionPosterUrl } from '@/services/image-handler.service'
import type { PromotionDetail } from '@/types/promotion-read'
import type { CinemaOption } from '@/types/promotion'

const props = withDefaults(defineProps<{
  promotionId: number | null
  cinemas?: CinemaOption[]
}>(), { cinemas: () => [] })
const emit = defineEmits<{ close: []; sessionExpired: []; forbidden: [] }>()
const shell = useTemplateRef<InstanceType<typeof ProjectionDialogShell>>('shell')
const detail = ref<PromotionDetail | null>(null)
const loading = ref(false)
const error = ref('')
const posterFailed = ref(false)
let request: AbortController | undefined
let version = 0
let disposed = false

const dateLabel = (date: string) => date.split('-').reverse().join('/')
const weekdayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const posterUrl = computed(() => getPromotionPosterUrl(detail.value?.posterPath))
const fields = computed(() => {
  const item = detail.value
  if (!item) return []
  const names = new Map(props.cinemas.map((cinema) => [cinema.id, cinema.name]))
  const amount = new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(item.promotionAmount)
  return [
    { label: 'ID de promoción', value: String(item.promotionId) },
    { label: 'Tipo de promoción', value: item.promotionType === 'percentage' ? 'Porcentaje' : 'Monto fijo' },
    { label: 'Descuento', value: item.promotionType === 'percentage' ? `${amount} %` : new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(item.promotionAmount) },
    { label: 'Descripción', value: item.description },
    { label: 'Condiciones', value: item.conditions?.trim() || 'Sin condiciones adicionales' },
    { label: 'Fecha inicial', value: dateLabel(item.beginDate) },
    { label: 'Fecha final', value: dateLabel(item.endDate) },
    { label: 'Horario', value: item.beginHour === null && item.endHour === null ? 'Todo el día' : `${item.beginHour ?? 'Sin registrar'} – ${item.endHour ?? 'Sin registrar'}` },
    { label: 'Días de la semana', value: item.weekdays.length ? [...item.weekdays].sort((a, b) => a - b).map((day) => weekdayNames[day - 1]).join(', ') : 'Todos los días' },
    { label: 'Formato', value: item.projectionFormat || 'Cualquier formato' },
    { label: 'Tecnología', value: item.technology === 'STANDARD' ? 'Estándar' : item.technology === '70MM' ? '70mm' : item.technology || 'Cualquier tecnología' },
    { label: 'Sucursales', value: item.branchIds.length ? item.branchIds.map((id) => names.get(id)?.trim() || `Sucursal #${id}`).join(', ') : 'Sin sucursales asociadas' },
  ]
})

function cancel() {
  version++
  request?.abort()
  request = undefined
  loading.value = false
}
async function load(id: number) {
  cancel()
  detail.value = null
  error.value = ''
  posterFailed.value = false
  if (!Number.isSafeInteger(id) || id < 1) {
    error.value = 'Selecciona una promoción válida.'
    return
  }
  const current = new AbortController()
  request = current
  loading.value = true
  try {
    const result = await getPromotion(id, current.signal)
    if (!current.signal.aborted && request === current) detail.value = result
  } catch (failure: unknown) {
    if (current.signal.aborted || request !== current) return
    const status = isAxiosError(failure) ? failure.response?.status : undefined
    if (status === 401) emit('sessionExpired')
    else if (status === 403) {
      error.value = 'No tienes permisos para realizar esta acción.'
      emit('forbidden')
    } else if (status === 404) error.value = 'Esta promoción ya no está disponible.'
    else error.value = 'No se pudo cargar el detalle, intenta de nuevo.'
  } finally {
    if (request === current) {
      loading.value = false
      request = undefined
    }
  }
}
function retry() {
  if (props.promotionId !== null) void load(props.promotionId)
}
watch(() => props.promotionId, async (id) => {
  cancel()
  detail.value = null
  error.value = ''
  if (id === null) { shell.value?.close(); return }
  const currentVersion = version
  await nextTick()
  if (disposed || currentVersion !== version || !Object.is(props.promotionId, id)) return
  shell.value?.open()
  void load(id)
}, { immediate: true })
onBeforeUnmount(() => { disposed = true; cancel() })
function closeDialog() {
  cancel()
  shell.value?.close()
  emit('close')
}
function shellClosed() {
  cancel()
  emit('close')
}
</script>

<template>
  <ProjectionDialogShell ref="shell" title="Detalle de promoción" @close="shellClosed">
    <div class="detail-content" :aria-busy="loading">
      <LoadingState v-if="loading" class="detail-feedback" message="Cargando el detalle…" compact />
      <div v-else-if="error" class="detail-feedback detail-error" role="alert">
        {{ error }}
        <button type="button" class="link-button" @click="retry">Reintentar</button>
      </div>
      <div v-else-if="detail" class="detail-body">
        <div class="detail-main">
          <h3 class="detail-title">{{ detail.promotionTitle }}</h3>
          <dl class="detail-grid">
            <div v-for="field in fields" :key="field.label" class="detail-field">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </div>
          </dl>
        </div>
        <aside class="detail-poster" aria-label="Póster de la promoción">
          <img v-if="posterUrl && !posterFailed" :src="posterUrl" :alt="`Póster de ${detail.promotionTitle}`" @error="posterFailed = true" />
          <p v-else>{{ posterFailed ? 'No se pudo cargar el póster.' : 'Sin póster.' }}</p>
        </aside>
      </div>
      <footer class="detail-footer">
        <button type="button" class="secondary-button" @click="closeDialog">Cerrar</button>
      </footer>
    </div>
  </ProjectionDialogShell>
</template>

<style scoped>
.detail-content { min-height: 0; padding: 24px 32px; overflow-y: auto; }
.detail-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 40%); gap: 32px; align-items: start; }
.detail-main { min-width: 0; }
.detail-title { margin: 0 0 16px; font-size: 1.25rem; font-weight: 700; overflow-wrap: anywhere; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 0; }
.detail-field { min-width: 0; }
.detail-field dt { color: var(--text-secondary); font-weight: 500; }
.detail-field dd { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-poster { margin: 0; aspect-ratio: 16 / 9; display: grid; place-items: center; background: var(--content-background); border-radius: var(--radius-medium); overflow: hidden; }
.detail-poster img { width: 100%; height: 100%; min-height: 0; object-fit: contain; }
.detail-poster p { padding: 16px; }
.detail-feedback { margin: 0; padding: 24px; border-radius: var(--radius-medium); background: var(--content-background); color: var(--text-primary); }
.detail-error { color: var(--error-color); border-left: 4px solid var(--error-color); }
.link-button { border: 0; color: var(--text-primary); background: transparent; text-decoration: underline; }
.detail-footer { display: flex; justify-content: flex-end; margin-top: 24px; }
@media (max-width: 900px) { .detail-body { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .detail-content { padding: 20px 16px; } .detail-grid { grid-template-columns: 1fr; } }
</style>
