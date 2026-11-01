<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { getTransaction } from '@/services/transaction.service'
import type { TransactionDetail } from '@/types/transaction'
import {
  TRANSACTION_STATUS_LABELS,
  formatColones,
  formatDate,
  formatFunction,
  formatPaymentMethod,
  formatTransactionId,
} from '@/utils/transaction-format'

const props = defineProps<{ transactionId: number | null }>()
const emit = defineEmits<{
  close: []
  'session-expired': []
  forbidden: []
  /** The transaction no longer exists, so the list is out of date. */
  missing: []
}>()
const transaction = ref<TransactionDetail | null>(null)
const loading = ref(false)
const error = ref('')
const retryable = ref(false)
let request: AbortController | undefined

// The previous transaction is cleared first, so its data never shows under another ID (UT-057).
async function load() {
  request?.abort()
  transaction.value = null
  error.value = ''
  retryable.value = false
  const id = props.transactionId
  if (id === null) {
    loading.value = false
    return
  }
  const current = new AbortController()
  request = current
  loading.value = true
  try {
    const detail = await getTransaction(id, current.signal)
    if (!current.signal.aborted) transaction.value = detail
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
      error.value = 'No fue posible cargar el detalle de la transacción'
      emit('missing')
    } else {
      error.value = 'No se pudo cargar el detalle, intenta de nuevo'
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
  transaction.value = null
  emit('close')
}
watch(
  () => props.transactionId,
  () => void load(),
  { immediate: true },
)
onBeforeUnmount(() => request?.abort())
</script>

<template>
  <BaseModal :open="transactionId !== null" title="Detalle de transacción" @close="close">
    <div class="transaction-detail-content" :aria-busy="loading">
      <p v-if="loading" class="detail-feedback" role="status">Cargando el detalle…</p>
      <div v-else-if="error" class="detail-feedback detail-error" role="alert">
        <p>{{ error }}</p>
        <button v-if="retryable" type="button" class="detail-button" @click="load">
          Reintentar
        </button>
      </div>
      <template v-else-if="transaction">
        <section class="detail-group" aria-labelledby="transaction-summary">
          <h3 id="transaction-summary">
            <span class="group-number" aria-hidden="true">1</span> Resumen de la transacción
          </h3>
          <dl class="detail-grid">
            <div class="detail-field">
              <dt>IdTransacción</dt>
              <dd>{{ formatTransactionId(transaction.id) }}</dd>
            </div>
            <div class="detail-field">
              <dt>Fecha</dt>
              <dd>{{ formatDate(transaction.purchasedAt) }}</dd>
            </div>
            <div class="detail-field">
              <dt>Hora de compra</dt>
              <dd>{{ transaction.purchasedAt.slice(11, 16) }}</dd>
            </div>
            <div class="detail-field">
              <dt>Estado</dt>
              <dd>
                <span :class="['status-badge', transaction.status.toLowerCase()]">
                  {{ TRANSACTION_STATUS_LABELS[transaction.status] }}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section class="detail-group" aria-labelledby="transaction-client">
          <h3 id="transaction-client">
            <span class="group-number" aria-hidden="true">2</span> Cliente
          </h3>
          <dl class="detail-grid">
            <div class="detail-field">
              <dt>Cliente</dt>
              <dd>{{ transaction.clientName }}</dd>
            </div>
            <div class="detail-field">
              <dt>Correo electrónico</dt>
              <dd>{{ transaction.clientEmail }}</dd>
            </div>
          </dl>
        </section>

        <section class="detail-group" aria-labelledby="transaction-function">
          <h3 id="transaction-function">
            <span class="group-number" aria-hidden="true">3</span> Función
          </h3>
          <dl class="detail-grid">
            <div class="detail-field wide">
              <dt>Película y función</dt>
              <dd>{{ formatFunction(transaction) }}</dd>
            </div>
            <div class="detail-field">
              <dt>Sucursal</dt>
              <dd>{{ transaction.branchName ?? 'Sin nombre registrado' }}</dd>
            </div>
            <div class="detail-field">
              <dt>Boletos</dt>
              <dd>{{ transaction.tickets }}</dd>
            </div>
          </dl>
        </section>

        <section class="detail-group" aria-labelledby="transaction-products">
          <h3 id="transaction-products">
            <span class="group-number" aria-hidden="true">4</span> Productos y pago
          </h3>
          <div class="table-scroll">
            <table class="products-table">
              <caption class="visually-hidden">
                Productos de
                {{
                  formatTransactionId(transaction.id)
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Precio unitario</th>
                  <th scope="col">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in transaction.lines" :key="line.productId">
                  <td>{{ line.name }}</td>
                  <td>{{ line.quantity }}</td>
                  <td>{{ formatColones(line.unitPrice) }}</td>
                  <td>{{ formatColones(line.subtotal) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colspan="3">Total</th>
                  <td>{{ formatColones(transaction.total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <dl class="detail-grid">
            <div class="detail-field">
              <dt>Total</dt>
              <dd>{{ formatColones(transaction.total) }}</dd>
            </div>
            <div class="detail-field">
              <dt>Método de pago</dt>
              <dd>{{ formatPaymentMethod(transaction) }}</dd>
            </div>
          </dl>
        </section>
      </template>
      <footer class="detail-footer">
        <button type="button" class="detail-button" @click="close">Cerrar</button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.transaction-detail-content)::backdrop) {
  background: var(--overlay-background);
}
:global(.app-modal-card:has(.transaction-detail-content)) {
  width: min(840px, 100%);
  max-width: 840px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--dialog-background);
  color: var(--text-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
:global(.app-modal-card:has(.transaction-detail-content) .app-modal-title) {
  flex-shrink: 0;
  margin: 0;
  padding: 24px 80px 24px 32px;
  background: var(--primary-color);
  color: var(--content-background);
  text-align: left;
  font-style: normal;
  font-size: 1.375rem;
}
:global(.app-modal-card:has(.transaction-detail-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--content-background);
  border-radius: var(--radius-small);
}
:global(.app-modal-card:has(.transaction-detail-content) .app-modal-close:hover) {
  background: var(--surface-on-dark-hover);
}
:global(.app-modal-card:has(.transaction-detail-content) .app-modal-close:focus-visible) {
  outline-color: var(--focus-on-dark);
}
.transaction-detail-content {
  display: grid;
  gap: 18px;
  min-height: 0;
  padding: 24px 32px 28px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.detail-group {
  display: grid;
  gap: 16px;
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
  gap: 6px;
  min-width: 0;
}
.detail-field.wide {
  grid-column: 1 / -1;
}
dt {
  font-weight: 500;
}
dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-small);
}
.status-badge.paid {
  background: var(--success-background);
  color: var(--success-text);
}
.status-badge.cancelled {
  background: var(--error-background);
  color: var(--error-text);
}
.table-scroll {
  overflow-x: auto;
}
.products-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border-color);
}
.products-table th,
.products-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
}
.products-table td:not(:first-child),
.products-table thead th:not(:first-child) {
  text-align: right;
}
.products-table tfoot th,
.products-table tfoot td {
  font-weight: 700;
  border-bottom: 0;
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
  justify-content: flex-end;
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
  cursor: pointer;
}
.detail-button:hover {
  background: var(--surface-hover);
}
.detail-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
@media (max-width: 575px) {
  .transaction-detail-content {
    padding: 20px 16px;
  }
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  :global(.app-modal-card:has(.transaction-detail-content) .app-modal-title) {
    padding-left: 16px;
  }
  :global(.app-modal-card:has(.transaction-detail-content) .app-modal-close) {
    right: 16px;
  }
}
</style>
