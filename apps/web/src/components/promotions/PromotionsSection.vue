<script setup lang="ts">
import { ref } from 'vue'
import { isAxiosError } from 'axios'

import { getBranches, formatBranchId } from '@/services/branch.service'
import type { CinemaOption } from '@/types/promotion'
import PromotionCreate from '@/components/promotions/PromotionCreate.vue'

const cinemas = ref<CinemaOption[]>([])
const loadingCinemas = ref(false)
const cinemaError = ref('')
const creatingPromotion = ref(false)

async function openPromotionCreate() {
   if (loadingCinemas.value || creatingPromotion.value) return

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


function refreshPromotions() {
  // Reload your promotion list here.
}
function handleSessionExpired() {
  creatingPromotion.value = false
  cinemaError.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
}
function handleForbidden() {
  creatingPromotion.value = false
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

      <PromotionCreate
        v-if="creatingPromotion"
        :cinemas="cinemas"
        @close="creatingPromotion = false"
        @saved="refreshPromotions"
        @session-expired="handleSessionExpired"
        @forbidden="handleForbidden"
      />
  </div>


</template>
