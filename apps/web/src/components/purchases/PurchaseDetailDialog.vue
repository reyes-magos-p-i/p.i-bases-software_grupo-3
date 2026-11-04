<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import PurchaseSummary from './PurchaseSummary.vue'
import { getMyPurchase } from '@/services/purchase.service'
import { trackClientSession } from '@/services/client-session.service'
import { authErrorStatus } from '@/utils/auth-errors'
import type { PurchaseReceipt } from '@/types/purchase'

const props = defineProps<{ purchaseId: number | null }>()
const emit = defineEmits<{ close: []; 'session-expired': [] }>()
const purchase = ref<PurchaseReceipt | null>(null)
const loading = ref(false)
const error = ref('')
const retryable = ref(false)
let request: AbortController | undefined

// The previous purchase is cleared first, so its data never shows under another order.
async function load() {
  request?.abort()
  purchase.value = null
  error.value = ''
  retryable.value = false
  const id = props.purchaseId
  if (id === null) {
    loading.value = false
    return
  }
  const current = new AbortController()
  const sessionActive = trackClientSession()
  request = current
  loading.value = true
  try {
    const detail = await getMyPurchase(id, current.signal)
    if (!current.signal.aborted && sessionActive()) purchase.value = detail
  } catch (failure) {
    if (current.signal.aborted || !sessionActive()) return
    const status = authErrorStatus(failure)
    if (status === 401) {
      emit('session-expired')
    } else if (status === 403 || status === 404) {
      error.value = 'No tienes acceso a esta compra'
    } else {
      error.value = 'No se pudo cargar el detalle de la compra, intenta de nuevo'
      retryable.value = true
    }
  } finally {
    if (request === current) {
      loading.value = false
      request = undefined
    }
  }
}
watch(
  () => props.purchaseId,
  () => void load(),
  { immediate: true },
)
onBeforeUnmount(() => request?.abort())
</script>

<template>
  <BaseModal :open="purchaseId !== null" title="Detalle de compra" @close="emit('close')">
    <div class="purchase-detail" :aria-busy="loading">
      <LoadingState v-if="loading" message="Cargando el detalle…" />
      <div v-else-if="error" class="detail-error" role="alert">
        <p>{{ error }}</p>
        <button v-if="retryable" type="button" @click="load">Reintentar</button>
      </div>
      <PurchaseSummary v-else-if="purchase" :purchase="purchase" show-payment />
      <footer class="detail-footer">
        <button type="button" class="detail-button" @click="emit('close')">Cerrar</button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-card:has(.purchase-detail)) {
  width: min(840px, 100%);
  max-width: 840px;
}
.detail-error {
  padding: 16px;
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
}
.detail-error p {
  margin: 0 0 12px;
}
.detail-error p:last-child {
  margin-bottom: 0;
}
.detail-error button {
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
}
</style>
