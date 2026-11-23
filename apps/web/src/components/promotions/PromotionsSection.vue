<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'

import { getBranches, formatBranchId } from '@/services/branch.service'
import type { CinemaOption } from '@/types/promotion'
import PromotionCreate from '@/components/promotions/PromotionCreate.vue'
import PromotionList from '@/components/promotions/PromotionList.vue'
import { getPromotions } from '@/services/promotion.service'
import type { PromotionListItem } from '@/types/promotion-read'
import LoadingState from '../common/LoadingState.vue'
import PromotionView from '@/components/promotions/PromotionView.vue'
import PromotionDelete from '@/components/promotions/PromotionDelete.vue'

const cinemas = ref<CinemaOption[]>([])
const loadingCinemas = ref(false)
const cinemaError = ref('')
const creatingPromotion = ref(false)
const editingPromotionId = ref<number | null>(null)
const viewingPromotionId = ref<number | null>(null)
const deletingPromotion = ref<{ id: number; title: string } | null>(null)
const promotions = ref<PromotionListItem[]>([])
const loadingPromotions = ref(false)
const listError = ref('')
let listRequest: AbortController | undefined
let listVersion = 0
let disposed = false

function openPromotionCreate() { return openPromotionForm(null) }
function openPromotionEdit(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return
  return openPromotionForm(id)
}
async function openPromotionForm(editId: number | null) {
   if (deletingPromotion.value !== null || loadingCinemas.value || creatingPromotion.value || editingPromotionId.value !== null || viewingPromotionId.value !== null) return

  loadingCinemas.value = true
  cinemaError.value = ''
  cinemas.value = []

  try {
    const options = new Map<number, CinemaOption>()
    let page = 1
    let totalPages = 1

    do {
      const result = await getBranches({
        page,
        pageSize: 50,
      })

      if (disposed) return
      for (const branch of result.items) {
        const name = branch.name?.trim() || 'Sin nombre'
        const company = branch.companyName?.trim()

        options.set(branch.id, {
          id: branch.id,
          name: [
            formatBranchId(branch.id),
            name,
            company,
          ].filter(Boolean).join(' — '),
        })
      }

      totalPages = result.totalPages
      page++
    } while (page <= totalPages)

    cinemas.value = [...options.values()]

    if (!cinemas.value.length && editId === null) {
      cinemaError.value = 'No hay sucursales disponibles.'
      return
    }

    if (editId === null) creatingPromotion.value = true
    else editingPromotionId.value = editId
  } catch (failure: unknown) {
    if (disposed) return
    if (isAxiosError(failure)) {
    if (failure.response?.status === 401) {
      handleSessionExpired()
      return
    }

    if (failure.response?.status === 403) {
      handleForbidden()
      return
    }
  }

  cinemaError.value =
    'No se pudieron cargar las sucursales. Vuelve a intentarlo.'
  } finally {
    loadingCinemas.value = false
  }
}

function openPromotionDelete(id: number) {
  if (loadingPromotions.value || loadingCinemas.value || creatingPromotion.value
    || editingPromotionId.value !== null || viewingPromotionId.value !== null
    || deletingPromotion.value !== null) return
  const promotion = promotions.value.find((item) => item.promotionId === id)
  if (!promotion) return
  cinemaError.value = ''
  deletingPromotion.value = { id: promotion.promotionId, title: promotion.promotionTitle }
}

async function refreshPromotions() {
  listRequest?.abort()
  const version = ++listVersion
  const request = new AbortController()
  listRequest = request
  listError.value = ''
  loadingPromotions.value = true
  try {
    const result = await getPromotions(request.signal)
    if (disposed || request.signal.aborted || version !== listVersion) return
    promotions.value = result
  } catch (failure: unknown) {
    if (disposed || request.signal.aborted || version !== listVersion) return
    if (isAxiosError(failure)) {
      if (failure.response?.status === 401) { handleSessionExpired(); return }
      if (failure.response?.status === 403) { handleForbidden(); return }
    }
    listError.value = 'No se pudieron cargar las promociones. Vuelve a intentarlo.'
  } finally {
    if (version === listVersion) loadingPromotions.value = false
  }
}
function openPromotionView(id: number) {
  if (deletingPromotion.value !== null || creatingPromotion.value || editingPromotionId.value !== null || loadingCinemas.value || viewingPromotionId.value !== null) return
  cinemaError.value = ''
  viewingPromotionId.value = id
}

onMounted(() => { void refreshPromotions() })
onBeforeUnmount(() => { disposed = true; listVersion++; listRequest?.abort() })
function handleSessionExpired() {
  deletingPromotion.value = null
  creatingPromotion.value = false
  editingPromotionId.value = null
  viewingPromotionId.value = null
  cinemaError.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
}
function handleForbidden() {
  deletingPromotion.value = null
  creatingPromotion.value = false
  editingPromotionId.value = null
  viewingPromotionId.value = null
  cinemaError.value = 'No tienes permisos para crear promociones.'
}

</script>

<template>
  <div>
      <div class = "section-heading">
        <h1>Promociones</h1>
          <button type="button" :disabled="loadingCinemas" @click="openPromotionCreate" class="add-user-button">
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
             {{ loadingCinemas ? 'Cargando sucursales...' : 'Crear promoción' }}
          </button>
      </div>

      <p v-if="cinemaError" role="alert">
        {{ cinemaError }}
      </p>

      <PromotionList :promotions="promotions" :loading="loadingPromotions" :error="listError"
        @view="openPromotionView" @edit="openPromotionEdit"   @delete="openPromotionDelete" @retry="refreshPromotions" />
      <LoadingState v-if="loadingPromotions" message="Cargando películas…" />

      <PromotionDelete
        v-if="deletingPromotion !== null"
        :promotion="deletingPromotion"
        @close="deletingPromotion = null"
        @deleted="refreshPromotions"
        @not-found="refreshPromotions"
        @session-expired="handleSessionExpired"
        @forbidden="handleForbidden"
      />

      <PromotionCreate
        v-if="creatingPromotion"
        :cinemas="cinemas"
        @close="creatingPromotion = false"
        @saved="refreshPromotions"
        @session-expired="handleSessionExpired"
        @forbidden="handleForbidden"
      />
      <PromotionCreate
        v-if="editingPromotionId !== null"
        :key="editingPromotionId"
        mode="edit"
        :promotion-id="editingPromotionId"
        :cinemas="cinemas"
        @close="editingPromotionId = null"
        @saved="refreshPromotions"
        @session-expired="handleSessionExpired"
        @forbidden="handleForbidden"
      />
      <PromotionView
        v-if="viewingPromotionId !== null"
        :promotion-id="viewingPromotionId"
        :cinemas="cinemas"
        @close="viewingPromotionId = null"
        @session-expired="handleSessionExpired"
        @forbidden="handleForbidden"
      />
  </div>
</template>
