<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadStripe } from '@stripe/stripe-js'
import type {
  Appearance,
  Stripe,
  StripeElements,
  StripePaymentElement,
  StripeError,
} from '@stripe/stripe-js'
import type { CardIntent } from '@/types/purchase'

const props = defineProps<{ intent: CardIntent; disabled?: boolean }>()
const emit = defineEmits<{ paid: [intentId: string]; cancel: [] }>()

const container = ref<HTMLElement | null>(null)
const ready = ref(false)
const confirming = ref(false)
const error = ref('')

// Stripe renders inside an iframe, so it needs literal colors instead of CSS variables.
// Values come from the site palette and fall back to the same dark theme when unreadable.
const PALETTE_FALLBACK = {
  background: '#0f172a',
  text: '#f8f9fa',
  textSecondary: '#cbd5e1',
  primary: '#ffd700',
  danger: '#ffb4b4',
}
const HEX = /^#[0-9a-f]{6}$/i

function paletteColor(token: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return HEX.test(value) ? value : fallback
}

function stripeAppearance(): Appearance {
  return {
    theme: 'night',
    variables: {
      colorBackground: paletteColor('--surface-background', PALETTE_FALLBACK.background),
      colorText: paletteColor('--text-on-dark', PALETTE_FALLBACK.text),
      colorTextSecondary: PALETTE_FALLBACK.textSecondary,
      colorPrimary: paletteColor('--accent-color', PALETTE_FALLBACK.primary),
      colorDanger: PALETTE_FALLBACK.danger,
    },
  }
}

let stripe: Stripe | null = null
let elements: StripeElements | null = null
let element: StripePaymentElement | null = null

// Card and validation errors are already shown inside the payment form by Stripe,
// so only failures outside the form get a message here, avoiding a duplicate.
function ownMessage(failure: StripeError): string | null {
  if (failure.type === 'card_error' || failure.type === 'validation_error') return null
  return 'No se pudo confirmar el pago. Intenta nuevamente.'
}

onMounted(async () => {
  try {
    stripe = await loadStripe(props.intent.publishableKey)
    if (!stripe) throw new Error('Stripe.js did not load.')
    elements = stripe.elements({
      clientSecret: props.intent.clientSecret,
      locale: 'es',
      appearance: stripeAppearance(),
    })
    element = elements.create('payment', { layout: 'tabs', wallets: { link: 'never' } })
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
      error.value = ownMessage(failure) ?? ''
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
