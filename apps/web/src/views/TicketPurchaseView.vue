<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import PurchaseStepper from '@/components/purchases/PurchaseStepper.vue'
import FunctionSelectionStep from '@/components/purchases/FunctionSelectionStep.vue'
import SeatSelectionStep from '@/components/purchases/SeatSelectionStep.vue'
import PurchaseSummary from '@/components/purchases/PurchaseSummary.vue'
import GuestBuyerStep from '@/components/purchases/GuestBuyerStep.vue'
import GuestPurchaseAccess from '@/components/purchases/GuestPurchaseAccess.vue'
import PurchaseEmailStatus from '@/components/purchases/PurchaseEmailStatus.vue'
import { usePurchaseEmail } from '@/composables/usePurchaseEmail'
import { useTicketPurchase } from '@/composables/useTicketPurchase'
import { clearClientSession } from '@/services/client-session.service'
const route = useRoute(),
  router = useRouter()
let redirecting = false
const flow = useTicketPurchase(() => {
  if (redirecting) return
  redirecting = true
  clearClientSession()
  void router.replace({ path: '/', query: { login: 'client', reason: 'expired' } })
})
const {
  guest,
  guestBuyer,
  guestReceipt,
  buyerError,
  loginRequired,
  summaryStep,
  finalStep,
  labels,
  movie,
  functions,
  availability,
  selected,
  categories,
  quote,
  receipt,
  step,
  loading,
  busy,
  uncertain,
  restored,
  canRestart,
  error,
  notice,
} = flow
const emailNotice = ref(false)
const ticketEmail = usePurchaseEmail(receipt, guestReceipt, (message, failed) => {
  emailNotice.value = !failed
  error.value = failed ? message : ''
  notice.value = failed ? '' : message
})
function dismissNotice() {
  error.value = ''
  notice.value = ''
  emailNotice.value = false
}
watch(
  () => route.query.movieId,
  (value) => {
    const id = Number(value)
    if (typeof value === 'string' && /^[1-9]\d*$/u.test(value) && Number.isSafeInteger(id))
      void flow.load(id)
    else error.value = 'Selecciona una película desde el portal para comprar boletos.'
  },
  { immediate: true },
)
</script>
<template>
  <AppHeader />
  <main class="purchase-flow">
    <RouterLink to="/">← Volver al portal</RouterLink
    ><PurchaseStepper :step="step" :labels="labels" /><NotificationPopup
      v-if="error || notice"
      :type="error ? 'error' : emailNotice ? 'success' : 'alert'"
      :message="error || notice"
      placement="bottom-right"
      :duration="uncertain ? 0 : 7000"
      @close="dismissNotice"
    /><LoadingState v-if="loading" message="Cargando compra..." surface="dark" /><template v-else
      ><div v-if="canRestart" class="actions">
        <button type="button" class="purchase-action" @click="flow.restart">
          Volver a empezar
        </button>
      </div>
      <FunctionSelectionStep
        v-if="step === 1 && movie"
        :movie="movie"
        :functions="functions"
        :disabled="busy"
        @select="flow.chooseFunction"
      /><SeatSelectionStep
        v-if="availability && !receipt"
        v-show="step === 2"
        :key="availability.function.id"
        :availability="availability"
        :selected="selected"
        :categories="categories"
        :disabled="busy || uncertain"
        @selection="flow.setSelection"
        @category="flow.setCategory"
        @continue="flow.summarize"
        @back="flow.back"
      />
      <GuestBuyerStep
        v-if="guest && step === 3"
        :buyer="guestBuyer"
        :disabled="busy"
        :error="buyerError"
        :login-required="loginRequired"
        @continue="flow.identify"
        @back="flow.back"
        @login="router.replace({ path: route.path, query: { ...route.query, login: 'client' } })"
      />
      <section v-if="step === summaryStep && quote">
        <h1>Revisa tu compra</h1>
        <p v-if="restored" role="status">
          Recuperamos un intento de compra pendiente. Reintenta el pago para comprobar su resultado
          sin duplicarlo.
        </p>
        <PurchaseSummary :purchase="quote" :buyer-email="guestBuyer?.email" />
        <div class="actions">
          <button
            type="button"
            class="purchase-action"
            :disabled="busy || uncertain"
            @click="flow.back"
          >
            {{ guest ? 'Volver al correo' : 'Volver a los asientos' }}</button
          ><button type="button" class="purchase-action primary" :disabled="busy" @click="flow.pay">
            {{ busy ? 'Registrando compra...' : uncertain ? 'Reintentar pago' : 'Pagar' }}
          </button>
        </div>
      </section>
      <section v-if="receipt && step === finalStep" aria-live="polite">
        <h1>¡Compra exitosa!</h1>
        <p>
          {{
            guestReceipt
              ? 'Tu compra como invitado quedó registrada.'
              : 'Tu compra quedó registrada en tu cuenta.'
          }}
        </p>
        <GuestPurchaseAccess v-if="guestReceipt" :access-code="guestReceipt.accessCode" />
        <PurchaseSummary :purchase="receipt" />
        <PurchaseEmailStatus
          :status="ticketEmail.status.value"
          :busy="ticketEmail.busy.value"
          :checking="ticketEmail.checking.value"
          :seconds="ticketEmail.seconds.value"
          :error="ticketEmail.error.value"
          @resend="ticketEmail.resend"
          @check="ticketEmail.check"
        />
      </section>
      <p v-if="!movie && !loading && !receipt">
        Elige una película en el portal para comenzar.
      </p></template
    >
  </main>
  <AppFooter />
</template>
<style scoped>
.purchase-flow {
  max-width: 1100px;
  min-height: 70vh;
  margin: auto;
  padding: 28px 24px 48px;
  color: var(--text-on-dark);
}
.purchase-flow a {
  color: var(--text-on-dark);
  text-underline-offset: 4px;
}
.purchase-flow :deep(.purchase-action),
.purchase-flow :deep(.purchase-select) {
  min-height: 44px;
  border-radius: var(--radius-small);
  padding: 10px 18px;
  font: inherit;
  border: 1px solid var(--border-on-dark);
}
.purchase-flow :deep(.purchase-action) {
  background: var(--surface-background);
  color: var(--text-on-dark);
}
.purchase-flow :deep(.purchase-action.primary) {
  background: var(--accent-color);
  color: var(--page-background);
  border-color: var(--accent-color);
  font-weight: 700;
}
.purchase-flow :deep(.purchase-action:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}
.purchase-flow :deep(.purchase-select) {
  background: var(--content-background);
  color: var(--text-primary);
}
.purchase-flow :deep(.purchase-action:focus-visible) {
  outline: 3px solid var(--focus-on-dark);
  outline-offset: 3px;
}
@media (max-width: 576px) {
  .purchase-flow {
    padding-inline: 16px;
  }
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 14px;
  margin: 24px 0;
}
</style>
