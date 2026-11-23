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

const cinemas = ref<CinemaOption[]>([])
const loadingCinemas = ref(false)
const cinemaError = ref('')
const creatingPromotion = ref(false)
const viewingPromotionId = ref<number | null>(null)
const promotions = ref<PromotionListItem[]>([])
const loadingPromotions = ref(false)
const listError = ref('')
let listRequest: AbortController | undefined
let listVersion = 0
let disposed = false

async function openPromotionCreate() {
   if (loadingCinemas.value || creatingPromotion.value || viewingPromotionId.value !== null) return

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

    if (!cinemas.value.length) {
      cinemaError.value = 'No hay sucursales disponibles.'
      return
    }

    creatingPromotion.value = true
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
  if (creatingPromotion.value || loadingCinemas.value || viewingPromotionId.value !== null) return
  cinemaError.value = ''
  viewingPromotionId.value = id
}

onMounted(() => { void refreshPromotions() })
onBeforeUnmount(() => { disposed = true; listVersion++; listRequest?.abort() })
function handleSessionExpired() {
  creatingPromotion.value = false
  viewingPromotionId.value = null
  cinemaError.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
}
function handleForbidden() {
  creatingPromotion.value = false
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
        @view="openPromotionView" @retry="refreshPromotions" />
      <LoadingState v-if="loadingPromotions" message="Cargando películas…" />

      <PromotionCreate
        v-if="creatingPromotion"
        :cinemas="cinemas"
        @close="creatingPromotion = false"
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
