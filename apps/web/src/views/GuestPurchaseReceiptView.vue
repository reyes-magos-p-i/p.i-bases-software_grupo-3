<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import { lookupGuestPurchase } from '@/services/guest-purchase.service'
import { purchaseError } from '@/services/purchase.service'
import type { GuestPurchaseReceipt } from '@/types/purchase'
import { readGuestPurchaseLink } from '@/utils/guest-purchase-link'
const route = useRoute()
const accessCode = computed(() => readGuestPurchaseLink(route.hash))
const loading = ref(false),
  error = ref('')
const receipt = ref<GuestPurchaseReceipt | null>(null)
let controller: AbortController | undefined
async function load() {
  controller?.abort()
  receipt.value = null
  error.value = ''
  loading.value = false
  const code = accessCode.value
  if (!code) {
    error.value = 'El enlace de esta compra no es válido. Comprueba que esté completo.'
    return
  }
  controller = new AbortController()
  const request = controller
  loading.value = true
  try {
    const data = await lookupGuestPurchase(code, request.signal)
    if (!request.signal.aborted) receipt.value = data
  } catch (error_) {
    if (!request.signal.aborted) error.value = purchaseError(error_)
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
function retry() {
  if (!loading.value) void load()
}
watch(
  () => route.hash,
  () => void load(),
  { immediate: true },
)
onBeforeUnmount(() => controller?.abort())
</script>
<template>
  <AppHeader />
  <main class="guest-receipt surface-theme--dark" :aria-busy="loading">
    <RouterLink to="/">← Volver al portal</RouterLink>
    <h1>Tu compra</h1>
    <p v-if="!accessCode">
      Abre el enlace completo que recibiste al terminar la compra o por correo.
    </p>
    <LoadingState v-if="loading" message="Cargando compra..." surface="dark" />
    <PurchaseSummary v-else-if="receipt" :purchase="receipt" />
    <button v-else-if="accessCode" type="button" @click="retry">Reintentar</button>
    <NotificationPopup
      v-if="error"
      type="error"
      :message="error"
      :duration="0"
      placement="bottom-right"
      @close="error = ''"
    />
  </main>
  <AppFooter />
</template>
<style scoped>
.guest-receipt {
  max-width: 1000px;
  min-height: 70vh;
  margin: auto;
  padding: 28px 24px 48px;
  color: var(--text-on-dark);
}
a {
  color: var(--text-on-dark);
}
h1 {
  margin-top: 28px;
}
button {
  justify-self: start;
  padding: 12px 20px;
  min-height: 44px;
  border-radius: var(--radius-small);
  border: 1px solid var(--accent-color);
  background: var(--accent-color);
  color: var(--page-background);
  font: inherit;
  font-weight: 600;
}
button:focus-visible {
  outline: 3px solid var(--primary-color);
  outline-offset: 3px;
}
</style>
