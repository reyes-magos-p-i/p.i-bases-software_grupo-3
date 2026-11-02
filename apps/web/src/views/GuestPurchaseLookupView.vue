<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import { useBlurValidation } from '@/composables/useBlurValidation'
import { lookupGuestPurchase } from '@/services/guest-purchase.service'
import { purchaseError } from '@/services/purchase.service'
import type { GuestPurchaseReceipt } from '@/types/purchase'
import { normalizeGuestPurchaseCode, validGuestPurchaseCode } from '@/utils/guest-purchase-code'
const code = ref(''),
  touched = ref(false),
  loading = ref(false),
  error = ref('')
const receipt = ref<GuestPurchaseReceipt | null>(null)
const shouldValidate = useBlurValidation()
let controller: AbortController | undefined
function validationError() {
  if (!code.value.trim())
    return 'Introduce el código de consulta que recibiste al terminar la compra.'
  return validGuestPurchaseCode(code.value)
    ? ''
    : 'Introduce el código de consulta completo de tu compra.'
}
async function lookup() {
  if (loading.value) return
  touched.value = true
  receipt.value = null
  error.value = ''
  if (validationError()) return
  controller = new AbortController()
  const request = controller
  loading.value = true
  try {
    const data = await lookupGuestPurchase(normalizeGuestPurchaseCode(code.value), request.signal)
    if (!request.signal.aborted) receipt.value = data
  } catch (error_) {
    if (!request.signal.aborted) error.value = purchaseError(error_)
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
onBeforeUnmount(() => controller?.abort())
</script>
<template>
  <AppHeader />
  <main class="guest-lookup">
    <RouterLink to="/">← Volver al portal</RouterLink>
    <h1>Consultar compra</h1>
    <p>Introduce el código privado de tu compra como invitado para consultar tus boletos.</p>
    <form novalidate @submit.prevent="lookup">
      <label for="guest-purchase-code">Código de consulta</label>
      <input
        id="guest-purchase-code"
        v-model="code"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :disabled="loading"
        :aria-invalid="touched && !!validationError()"
        :aria-describedby="touched && validationError() ? 'lookup-code-error' : undefined"
        @blur="touched = shouldValidate($event) || touched"
      />
      <p v-if="touched && validationError()" id="lookup-code-error" class="field-error">
        {{ validationError() }}
      </p>
      <button type="submit" :disabled="loading">Consultar compra</button>
    </form>
    <LoadingState v-if="loading" message="Consultando compra..." surface="dark" />
    <PurchaseSummary v-else-if="receipt" :purchase="receipt" />
    <NotificationPopup
      v-if="error"
      type="error"
      :message="error"
      placement="bottom-right"
      @close="error = ''"
    />
  </main>
  <AppFooter />
</template>
<style scoped>
.guest-lookup {
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
form {
  display: grid;
  gap: 12px;
  max-width: 680px;
  margin: 28px 0;
}
input {
  min-height: 44px;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  font: inherit;
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
input:focus-visible,
button:focus-visible {
  outline: 3px solid var(--primary-color);
  outline-offset: 3px;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.field-error {
  color: var(--error-text);
  background: var(--error-background);
  padding: 10px;
  border-radius: var(--radius-small);
  margin: 0;
}
</style>
