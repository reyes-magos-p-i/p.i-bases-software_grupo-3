<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId } from 'vue'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import PurchaseDetailDialog from './PurchaseDetailDialog.vue'
import { getMyPurchases } from '@/services/purchase.service'
import { trackClientSession } from '@/services/client-session.service'
import { authErrorStatus } from '@/utils/auth-errors'
import { TRANSACTION_STATUS_LABELS, formatColones, formatDate } from '@/utils/transaction-format'
import type { PurchaseList, PurchaseListQuery } from '@/types/purchase'

type PurchaseFilters = Omit<PurchaseListQuery, 'page'>

defineProps<{ purchaseId?: number | null }>()
const emit = defineEmits<{ sessionExpired: []; select: [id: number | null] }>()
const id = useId()
const draft = reactive({ search: '', dateFrom: '', dateTo: '' })
const applied = ref<PurchaseFilters>({})
const data = ref<PurchaseList | null>(null)
const loading = ref(false)
const loadFailed = ref(false)
const dateError = ref('')
let disposed = false
let request: AbortController | undefined

const columns = [
  { key: 'date', label: 'Fecha' },
  { key: 'reference', label: 'N.º de orden' },
  { key: 'title', label: 'Película' },
  { key: 'quantity', label: 'Boletos' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Estado' },
]
const rows = computed(() =>
  (data.value?.items ?? []).map((purchase) => ({
    id: purchase.id,
    date: formatDate(purchase.purchasedAt),
    reference: purchase.reference,
    title: purchase.title,
    quantity: purchase.quantity,
    total: formatColones(purchase.total),
    status: TRANSACTION_STATUS_LABELS[purchase.status],
    statusClass: purchase.status.toLowerCase(),
  })),
)
const hasFilters = computed(() => Object.keys(applied.value).length > 0)
const summary = computed(() => {
  const total = data.value?.total ?? 0
  return `${total} ${total === 1 ? 'compra' : 'compras'} · de la más reciente a la más antigua`
})

async function load(page = 1) {
  request?.abort()
  const current = new AbortController()
  const sessionActive = trackClientSession()
  request = current
  loading.value = true
  loadFailed.value = false
  try {
    const result = await getMyPurchases({ page, ...applied.value }, current.signal)
    if (!current.signal.aborted && sessionActive()) data.value = result
  } catch (failure) {
    if (current.signal.aborted || !sessionActive()) return
    loadFailed.value = true
    if (authErrorStatus(failure) === 401) emit('sessionExpired')
  } finally {
    if (!disposed && request === current) loading.value = false
  }
}
// Keeps the current list when the range is invalid (UT-067).
function applyFilters() {
  const { dateFrom, dateTo } = draft
  const search = draft.search.trim()
  dateError.value =
    dateFrom && dateTo && dateFrom > dateTo
      ? 'La fecha inicial no puede ser posterior a la fecha final'
      : ''
  if (dateError.value) return
  applied.value = {
    ...(search ? { search } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  }
  void load()
}
function clearFilters() {
  Object.assign(draft, { search: '', dateFrom: '', dateTo: '' })
  dateError.value = ''
  applied.value = {}
  void load()
}
onMounted(() => void load())
onBeforeUnmount(() => {
  disposed = true
  request?.abort()
})
</script>

<template>
  <section class="purchase-history" :aria-labelledby="id + '-title'">
    <h2 :id="id + '-title'">Historial de compras</h2>
    <p>Consulta las compras realizadas con tu cuenta de Cinetadel.</p>

    <form class="history-filters" novalidate @submit.prevent="applyFilters">
      <label class="search-field"
        >Buscar
        <input
          v-model="draft.search"
          type="search"
          name="search"
          maxlength="20"
          placeholder="Número de orden"
      /></label>
      <button type="submit" class="primary">Buscar</button>
      <label
        >Desde
        <input
          v-model="draft.dateFrom"
          type="date"
          name="dateFrom"
          title="Desde: día/mes/año"
          :aria-invalid="!!dateError"
      /></label>
      <label
        >Hasta
        <input
          v-model="draft.dateTo"
          type="date"
          name="dateTo"
          title="Hasta: día/mes/año"
          :aria-invalid="!!dateError"
      /></label>
      <button type="submit" class="primary">Filtrar</button>
      <button type="button" @click="clearFilters">
        <i class="bi bi-x-circle" aria-hidden="true" /> Limpiar
      </button>
    </form>
    <p v-if="dateError" class="feedback" role="alert">{{ dateError }}</p>

    <div :aria-busy="loading">
      <LoadingState v-if="loading" message="Cargando compras…" />
      <div v-else-if="loadFailed" class="feedback" role="alert">
        <p>No se pudo cargar el historial de compras, intenta de nuevo</p>
        <button type="button" @click="load(data?.page ?? 1)">Reintentar</button>
      </div>
      <template v-else-if="data">
        <p v-if="!data.items.length" class="empty" role="status">
          {{
            hasFilters
              ? 'No se encontraron compras con ese criterio'
              : 'Aún no tienes compras registradas'
          }}
        </p>
        <template v-else>
          <p class="result-count" role="status">{{ summary }}</p>
          <CrudTable :columns="columns" :rows="rows" caption="Historial de compras">
            <template #cell-status="{ row, value }">
              <span :class="['status-badge', row.statusClass]">{{ value }}</span>
            </template>
            <template #actions="{ row }">
              <button
                type="button"
                class="view-button"
                title="Ver detalle"
                :aria-label="`Ver detalle de ${row.reference}`"
                @click="emit('select', row.id as number)"
              >
                <i class="bi bi-eye" aria-hidden="true" />
              </button>
            </template>
          </CrudTable>
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
            </button>
          </nav>
        </template>
      </template>
    </div>

    <PurchaseDetailDialog
      :purchase-id="purchaseId ?? null"
      @close="emit('select', null)"
      @session-expired="emit('sessionExpired')"
    />
  </section>
</template>

<style scoped>
.history-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin: 16px 0;
}
.history-filters label {
  display: grid;
  gap: 6px;
  color: var(--text-primary);
}
.search-field {
  flex: 1 1 220px;
}
input {
  min-height: 44px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
}
button {
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
}
button.primary {
  font-weight: 600;
}
button:disabled {
  opacity: 0.5;
}
.view-button {
  min-height: 36px;
  padding: 4px 10px;
}
.feedback {
  color: var(--text-primary);
  font-weight: 600;
}
.result-count,
.empty {
  color: var(--text-secondary);
}
.status-badge {
  padding: 2px 10px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 0.875rem;
}
.status-badge.cancelled {
  font-weight: 600;
}
nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin-top: 16px;
}
</style>
