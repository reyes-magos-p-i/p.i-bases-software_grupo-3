<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { formatBranchId, getBranch } from '@/services/branch.service'
import type { BranchDetail } from '@/types/branch'

const props = defineProps<{ branchId: number | null }>()
const emit = defineEmits<{
  close: []
  modify: [branch: BranchDetail]
  'session-expired': []
  forbidden: []
}>()
const branch = ref<BranchDetail | null>(null)
const loading = ref(false)
const error = ref('')
const retryable = ref(false)
let request: AbortController | undefined

// The database requires both values, so "missing" means a text of only spaces (null from the API).
const missingName = computed(() => !!branch.value && !branch.value.name)
const missingCompany = computed(() => !!branch.value && !branch.value.companyName)

async function load() {
  request?.abort()
  branch.value = null
  error.value = ''
  retryable.value = false
  const id = props.branchId
  if (id === null) {
    loading.value = false
    return
  }
  const current = new AbortController()
  request = current
  loading.value = true
  try {
    const detail = await getBranch(id, current.signal)
    if (!current.signal.aborted) branch.value = detail
  } catch (failure) {
    if (current.signal.aborted) return
    const status = isAxiosError(failure) ? failure.response?.status : undefined
    if (status === 401) {
      error.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
      emit('session-expired')
    } else if (status === 403) {
      error.value = 'No tiene permisos para acceder a esta sección'
      emit('forbidden')
    } else if (status === 404) {
      error.value = 'La sucursal seleccionada no existe.'
    } else {
      error.value = 'No se pudo cargar la sucursal, intenta de nuevo'
      retryable.value = true
    }
  } finally {
    if (request === current) {
      loading.value = false
      request = undefined
    }
  }
}
function close() {
  request?.abort()
  branch.value = null
  emit('close')
}
watch(
  () => props.branchId,
  () => void load(),
  { immediate: true },
)
onBeforeUnmount(() => request?.abort())
</script>

<template>
  <BaseModal :open="branchId !== null" title="Detalle de sucursal" @close="close">
    <div class="branch-detail-content" :aria-busy="loading">
      <p v-if="loading" class="detail-feedback" role="status">Cargando datos de la sucursal…</p>
      <div v-else-if="error" class="detail-feedback detail-error" role="alert">
        <p>{{ error }}</p>
        <button v-if="retryable" type="button" class="detail-button" @click="load">
          Reintentar
        </button>
      </div>
      <template v-else-if="branch">
        <p v-if="missingName || missingCompany" class="incomplete-notice" role="alert">
          <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
          Hay datos incompletos en esta sucursal. Modifícala para completarlos.
        </p>
        <section class="detail-group" aria-labelledby="branch-detail-group">
          <h3 id="branch-detail-group">
            <span class="group-number" aria-hidden="true">1</span> Datos de la sucursal
          </h3>
          <dl class="detail-grid">
            <div class="detail-field">
              <dt>ID Sucursal</dt>
              <dd>
                <span class="readonly-value">{{ formatBranchId(branch.id) }}</span>
              </dd>
            </div>
            <div class="detail-field">
              <dt>Estado</dt>
              <dd>
                <span class="readonly-value status">
                  {{ branch.status === 'ACTIVE' ? 'Activa' : 'Inactiva' }}
                </span>
              </dd>
            </div>
            <div class="detail-field">
              <dt>Nombre</dt>
              <dd>
                <span class="readonly-value" :class="{ missing: missingName }">
                  {{ branch.name ?? '—' }}
                </span>
                <p v-if="missingName" class="field-alert">
                  <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                  Esta sucursal no tiene nombre registrado
                </p>
              </dd>
            </div>
            <div class="detail-field">
              <dt>Compañía</dt>
              <dd>
                <span class="readonly-value" :class="{ missing: missingCompany }">
                  {{ branch.companyName ?? '—' }}
                </span>
                <p v-if="missingCompany" class="field-alert">
                  <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
                  Esta sucursal no tiene compañía asignada
                </p>
              </dd>
            </div>
          </dl>
        </section>
      </template>
      <footer class="detail-footer">
        <button type="button" class="detail-button" @click="close">Cerrar</button>
        <button
          v-if="branch"
          type="button"
          class="detail-button primary"
          aria-haspopup="dialog"
          @click="emit('modify', branch)"
        >
          <i class="bi bi-pencil-square" aria-hidden="true"></i> Modificar
        </button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.branch-detail-content)::backdrop) {
  background: var(--overlay-background);
}
:global(.app-modal-card:has(.branch-detail-content)) {
  width: min(760px, 100%);
  max-width: 760px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--dialog-background);
  color: var(--text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
:global(.app-modal-card:has(.branch-detail-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 32px;
  background: var(--primary-color);
  color: var(--content-background);
  text-align: left;
  font-style: normal;
  font-size: 1.375rem;
}
:global(.app-modal-card:has(.branch-detail-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--content-background);
  border-radius: var(--radius-small);
}
:global(.app-modal-card:has(.branch-detail-content) .app-modal-close:hover) {
  background: var(--surface-on-dark-hover);
}
:global(.app-modal-card:has(.branch-detail-content) .app-modal-close:focus-visible) {
  outline-color: var(--focus-on-dark);
}
.branch-detail-content {
  display: grid;
  gap: 18px;
  min-height: 0;
  padding: 24px 32px 28px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.incomplete-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--radius-small);
  background: var(--error-background);
  color: var(--error-text);
}
.detail-group {
  display: grid;
  gap: 18px;
  padding: 22px 20px 24px;
  border-radius: var(--radius-medium);
  background: var(--content-background);
}
.detail-group h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 700;
}
.group-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--primary-color);
  color: var(--content-background);
  font-size: 0.8125rem;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
}
.detail-field {
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
}
dt {
  font-weight: 500;
}
dd {
  display: grid;
  gap: 7px;
  margin: 0;
}
.readonly-value {
  display: flex;
  align-items: center;
  min-height: 46px;
  padding: 10px 14px 10px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--input-disabled-background);
  overflow-wrap: anywhere;
}
.readonly-value.status {
  font-weight: 600;
}
.readonly-value.missing {
  border-color: var(--error-color);
  color: var(--text-secondary);
}
.field-alert {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: var(--error-color);
  font-size: 0.85rem;
}
.detail-feedback {
  margin: 0;
  padding: 16px;
  border-left: 3px solid var(--primary-color);
  background: var(--content-background);
}
.detail-feedback p {
  margin: 0 0 12px;
}
.detail-error {
  border-color: var(--error-color);
  color: var(--error-color);
}
.detail-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 4px;
}
.detail-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 46px;
  padding: 10px 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--button-secondary-text);
  font: inherit;
}
.detail-button.primary {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: var(--content-background);
  font-weight: 600;
}
.detail-button:not(:disabled):hover {
  background: var(--surface-hover);
}
.detail-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.detail-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
@media (max-width: 575px) {
  .branch-detail-content {
    padding: 20px 16px;
  }
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  :global(.app-modal-card:has(.branch-detail-content) .app-modal-title) {
    padding-left: 16px;
  }
  :global(.app-modal-card:has(.branch-detail-content) .app-modal-close) {
    right: 16px;
  }
}
</style>
