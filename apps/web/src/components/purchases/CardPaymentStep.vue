<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadStripe } from '@stripe/stripe-js'
import type { Stripe, StripeElements, StripePaymentElement, StripeError } from '@stripe/stripe-js'
import type { CardIntent } from '@/types/purchase'

const props = defineProps<{ intent: CardIntent; disabled?: boolean }>()
const emit = defineEmits<{ paid: [intentId: string]; cancel: [] }>()

const container = ref<HTMLElement | null>(null)
const ready = ref(false)
const confirming = ref(false)
const error = ref('')

let stripe: Stripe | null = null
let elements: StripeElements | null = null
let element: StripePaymentElement | null = null

function declineMessage(failure: StripeError) {
  if (failure.code === 'card_declined' && failure.decline_code === 'insufficient_funds')
    return 'Fondos insuficientes en la tarjeta. Intenta con otra tarjeta.'
  if (failure.type === 'card_error')
    return 'La tarjeta no es válida o fue rechazada. Revisa los datos o usa otra tarjeta.'
  return 'No se pudo confirmar el pago. Intenta nuevamente.'
}

onMounted(async () => {
  try {
    stripe = await loadStripe(props.intent.publishableKey)
    if (!stripe) throw new Error('Stripe.js did not load.')
    elements = stripe.elements({ clientSecret: props.intent.clientSecret, locale: 'es' })
    element = elements.create('payment', { layout: 'tabs' })
    element.on('ready', () => (ready.value = true))
    element.mount(container.value!)
  } catch {
    error.value = 'No se pudo cargar el formulario de pago. Intenta nuevamente.'
  }
})

onBeforeUnmount(() => {
  element?.destroy()
})

async function pay() {
  if (!stripe || !elements || confirming.value || props.disabled) return
  confirming.value = true
  error.value = ''
  try {
    const { paymentIntent, error: failure } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (failure) {
      error.value = declineMessage(failure)
      return
    }
    if (paymentIntent?.status === 'succeeded') emit('paid', paymentIntent.id)
    else error.value = 'El pago aún no fue aprobado. Intenta nuevamente.'
  } catch {
    error.value = 'No se pudo confirmar el pago. Intenta nuevamente.'
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <section aria-labelledby="card-payment-title" class="card-payment">
    <h1 id="card-payment-title">Pago con tarjeta</h1>
    <p>
      Los datos de la tarjeta se envían directamente a Stripe. Cinetadel solo guarda la referencia
      del pago, la marca y los últimos cuatro dígitos.
    </p>
    <div ref="container" class="card-payment__element" />
    <p v-if="error" class="card-payment__error" role="alert">{{ error }}</p>
    <div class="card-payment__actions">
      <button type="button" class="purchase-action" :disabled="confirming" @click="emit('cancel')">
        Cancelar
      </button>
      <button
        type="button"
        class="purchase-action primary"
        :disabled="!ready || confirming || disabled"
        @click="pay"
      >
        {{ confirming ? 'Procesando pago...' : 'Pagar' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.card-payment__element {
  margin: 20px 0;
  min-height: 120px;
}
.card-payment__error {
  color: var(--error-color, #ffb4b4);
  font-weight: 600;
}
.card-payment__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 14px;
  margin: 24px 0;
}
</style>
