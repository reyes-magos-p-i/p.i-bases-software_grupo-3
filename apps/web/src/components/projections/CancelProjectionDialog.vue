<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { cancelProjection } from '@/services/projection.service'
import type { ListedProjection, ProjectionApiError, ProjectionDetail } from '@/types/projection'
import {
  formatProjectionDate,
  formatProjectionTime,
  projectionCode,
} from '@/utils/projection-format'
import { localNow } from '@/utils/projection-time'

const URGENT_HOURS = 24
const props = defineProps<{ projection: ListedProjection | null }>()
const emit = defineEmits<{
  close: []
  cancelled: [projection: ProjectionDetail]
  sessionExpired: []
  forbidden: []
}>()
const saving = ref(false)
const error = ref('')
const feedback = useTemplateRef<HTMLElement>('feedback')
let disposed = false

const code = computed(() => (props.projection ? projectionCode('MF', props.projection.movieFunctionId) : ''))
/** In progress, or starting within the next 24 hours (Costa Rica local time). */
const urgency = computed(() => {
  const projection = props.projection
  if (!projection) return ''
  if (projection.status === 'IN_PROGRESS') return 'Esta función está en curso.'
  const hoursLeft =
    (Date.parse(`${projection.startTime}:00Z`) - Date.parse(`${localNow()}:00Z`)) / 3_600_000
  return hoursLeft < URGENT_HOURS ? 'Esta función empieza en menos de 24 horas.' : ''
})

watch(
  () => props.projection,
  () => {
    error.value = ''
  },
)

function close() {
  if (!saving.value) emit('close')
}

async function confirm() {
  const projection = props.projection
  if (!projection || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const cancelled = await cancelProjection(projection.movieFunctionId)
    if (!disposed) emit('cancelled', cancelled)
  } catch (failure) {
    if (disposed) return
    const status = isAxiosError(failure) ? failure.response?.status : undefined
    if (status === 401) {
      error.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
      emit('sessionExpired')
    } else if (status === 403) {
      error.value = 'No tienes permisos para realizar esta acción.'
      emit('forbidden')
    } else if (status === 404) {
      error.value = 'Esta proyección ya no está disponible.'
    } else if (status === 409 && isAxiosError<ProjectionApiError>(failure)) {
      const message = failure.response?.data?.message
      error.value =
        typeof message === 'string' ? message : 'No se pudo cancelar la proyección, intenta de nuevo.'
    } else {
      error.value = 'No se pudo cancelar la proyección, intenta de nuevo.'
    }
    await nextTick()
    feedback.value?.focus()
  } finally {
    if (!disposed) saving.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <BaseModal
    :open="projection !== null"
    title="Cancelar proyección"
    :close-disabled="saving"
    @close="close"
  >
    <div class="projection-cancel-content" :aria-busy="saving">
      <template v-if="projection">
        <p>
          ¿Deseas cancelar la proyección <strong>{{ code }}</strong> de
          <strong>{{ projection.movieTitle }}</strong>?
        </p>
        <p class="cancel-summary">
          {{ projection.branchName }} · Sala {{ projection.theaterId }} ·
          {{ formatProjectionDate(projection.startTime) }}
          {{ formatProjectionTime(projection.startTime) }} –
          {{ formatProjectionTime(projection.endTime) }}
        </p>
        <p class="cancel-warning">
          La cancelación es irreversible desde esta interfaz. La sala quedará disponible para
          programar otra función en ese horario.
        </p>
        <p v-if="urgency" class="cancel-urgent" role="alert">
          <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
          <span>
            <strong>{{ urgency }}</strong> Si hay clientes con boletos, coordina el reembolso en
            oficina de inmediato.
          </span>
        </p>
        <p v-if="error" ref="feedback" class="cancel-error" role="alert" tabindex="-1">
          {{ error }}
        </p>
        <footer>
          <button type="button" class="secondary" :disabled="saving" @click="close">Volver</button>
          <button type="button" class="primary" :disabled="saving" @click="confirm">
            {{ saving ? 'Cancelando…' : 'Cancelar proyección' }}
          </button>
        </footer>
      </template>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.projection-cancel-content)::backdrop) {
  background: color-mix(in srgb, var(--page-background) 55%, transparent);
}
:global(.app-modal-card:has(.projection-cancel-content)) {
  width: min(640px, 100%);
  max-width: 640px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--content-background);
  color: var(--text-primary);
  overflow: hidden;
}
:global(.app-modal-card:has(.projection-cancel-content) .app-modal-title) {
  margin: 0;
  padding: 24px 80px 24px 24px;
  color: var(--text-on-dark);
  font-size: 1.25rem;
  font-style: normal;
  text-align: left;
  background: var(--primary-color);
}
:global(.app-modal-card:has(.projection-cancel-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--text-on-dark);
}
.projection-cancel-content {
  display: grid;
  gap: 12px;
  padding: 24px;
  overflow-wrap: anywhere;
}
.projection-cancel-content p {
  margin: 0;
}
.cancel-summary {
  color: var(--text-secondary);
}
.cancel-warning {
  padding: 16px;
  border-left: 3px solid var(--primary-color);
  background: var(--content-background);
  color: var(--text-primary);
}
.cancel-urgent {
  display: flex;
  gap: 10px;
  padding: 16px;
  border-left: 4px solid var(--accent-color);
  background: var(--warning-background);
}
.cancel-urgent .bi {
  color: var(--warning-text);
}
.cancel-error {
  color: var(--error-color);
}
footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}
button {
  min-height: 44px;
  padding: 10px 18px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  font: inherit;
  font-weight: 600;
}
.secondary {
  color: var(--text-primary);
  background: var(--content-background);
}
.primary {
  color: var(--text-on-dark);
  background: var(--primary-color);
}
button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
