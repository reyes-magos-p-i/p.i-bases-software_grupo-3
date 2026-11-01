<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import PurchaseSummary from './PurchaseSummary.vue'
import { getMyPurchases, getMyPurchase, purchaseError } from '@/services/purchase.service'
import { CLIENT_ACCESS_TOKEN_KEY, clientSessionRevision } from '@/services/client-session.service'
import { authErrorStatus } from '@/utils/auth-errors'
import { formatColones, formatDateTime } from '@/utils/transaction-format'
import type { PurchaseList, PurchaseReceipt } from '@/types/purchase'
const props = withDefaults(defineProps<{ purchaseId?: number | null }>(), { purchaseId: null })
const emit = defineEmits<{ sessionExpired: []; history: [] }>()
const data = ref<PurchaseList | null>(null),
  detail = ref<PurchaseReceipt | null>(null),
  loading = ref(false),
  error = ref(''),
  loadFailed = ref(false)
let generation = 0,
  disposed = false,
  request: AbortController | undefined
function session() {
  const revision = clientSessionRevision(),
    token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
  return () =>
    !disposed &&
    revision === clientSessionRevision() &&
    token === localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
}
async function run(action: (signal: AbortSignal) => Promise<void>) {
  const current = session(),
    serial = ++generation
  request?.abort()
  const controller = new AbortController()
  request = controller
  loading.value = true
  error.value = ''
  loadFailed.value = false
  try {
    await action(controller.signal)
  } catch (error_) {
    if (current() && serial === generation && !controller.signal.aborted) {
      loadFailed.value = true
      error.value = purchaseError(error_)
      if (authErrorStatus(error_) === 401) emit('sessionExpired')
    }
  } finally {
    if (!disposed && serial === generation) loading.value = false
  }
}
async function load(page = 1) {
  const current = session()
  await run(async (signal) => {
    const result = await getMyPurchases(page, signal)
    if (current() && !signal.aborted) {
      data.value = result
      detail.value = null
    }
  })
}
async function open(id: number) {
  detail.value = null
  const current = session()
  await run(async (signal) => {
    const result = await getMyPurchase(id, signal)
    if (current() && !signal.aborted) detail.value = result
  })
}
function showHistory() {
  detail.value = null
  if (!data.value) void load()
}
function backToHistory() {
  showHistory()
  emit('history')
}
function retry() {
  if (props.purchaseId !== null) void open(props.purchaseId)
  else void load(data.value?.page ?? 1)
}
watch(
  () => props.purchaseId,
  (id) => {
    if (id !== null) void open(id)
    else if (detail.value) showHistory()
  },
)
onMounted(() => {
  if (props.purchaseId === null) void load()
  else void open(props.purchaseId)
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  request?.abort()
})
</script>
<template>
  <section>
    <h2>Mis compras</h2>
    <LoadingState v-if="loading" message="Cargando compras..." /><template v-else-if="detail"
      ><button type="button" @click="backToHistory">← Volver a mis compras</button
      ><PurchaseSummary :purchase="detail" /></template
    ><template v-else-if="data"
      ><p>{{ data.total }} compras registradas</p>
      <p v-if="!data.items.length">Aún no tienes compras registradas.</p>
      <ul class="purchases">
        <li v-for="item in data.items" :key="item.id">
          <div>
            <strong>{{ item.title }}</strong>
            <p>{{ item.reference }} · {{ formatDateTime(item.purchasedAt) }}</p>
            <span
              >{{ item.quantity }} boletos · {{ formatColones(item.total) }} ·
              {{ item.status === 'PAID' ? 'Pagada' : 'Cancelada' }}</span
            >
          </div>
          <button type="button" @click="open(item.id)">Ver boletos</button>
        </li>
      </ul>
      <nav v-if="data.totalPages > 1" aria-label="Paginación de compras">
        <button
          type="button"
          :disabled="data.page <= 1"
          aria-label="Página anterior"
          @click="load(data.page - 1)"
        >
          <i class="bi bi-chevron-left" aria-hidden="true" /></button
        ><span>Página {{ data.page }} de {{ data.totalPages }}</span
        ><button
          type="button"
          :disabled="data.page >= data.totalPages"
          aria-label="Página siguiente"
          @click="load(data.page + 1)"
        >
          <i class="bi bi-chevron-right" aria-hidden="true" />
        </button></nav></template
    ><button v-else-if="loadFailed" type="button" @click="retry">Reintentar</button
    ><NotificationPopup
      v-if="error"
      type="error"
      :message="error"
      placement="bottom-right"
      @close="error = ''"
    />
  </section>
</template>
<style scoped>
.purchases {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 16px;
}
.purchases li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 18px 0;
  border-bottom: 1px solid var(--border-color);
}
.purchases p {
  margin: 8px 0;
}
.purchases span {
  color: var(--text-secondary);
}
button {
  min-height: 44px;
  border: 1px solid var(--border-color);
  background: var(--content-background);
  color: var(--text-primary);
  padding: 8px 16px;
  border-radius: var(--radius-small);
}
button:disabled {
  opacity: 0.5;
}
nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
@media (max-width: 480px) {
  .purchases li {
    align-items: start;
    flex-direction: column;
  }
}
</style>
