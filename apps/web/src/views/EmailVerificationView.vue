<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import {
  confirmEmailVerification,
  InvalidEmailVerificationError,
  resendEmailVerification,
} from '@/services/authService'

const route = useRoute()
const router = useRouter()
const status = ref<'checking' | 'invalid' | 'error'>('checking')
const email = ref('')
const resendLoading = ref(false)
const resendMessage = ref('')
const resendError = ref('')

async function verify() {
  status.value = 'checking'
  const token = route.query.token
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token)) {
    status.value = 'invalid'
    return
  }
  try {
    await confirmEmailVerification(token)
    await router.replace({ name: 'home' })
  } catch (error) {
    status.value =
      error instanceof InvalidEmailVerificationError ? 'invalid' : 'error'
  }
}

onMounted(verify)

async function resend() {
  resendMessage.value = ''
  resendError.value = ''
  resendLoading.value = true
  try {
    await resendEmailVerification(email.value.trim().toLowerCase())
    resendMessage.value =
      'Si existe una cuenta pendiente con ese correo, enviaremos un nuevo enlace.'
  } catch (error) {
    resendError.value =
      error instanceof Error
        ? error.message
        : 'No se pudo solicitar un nuevo enlace. Inténtalo nuevamente.'
  } finally {
    resendLoading.value = false
  }
}
</script>

<template>
  <AppHeader />
  <main class="verification-page">
    <section class="verification-card" aria-live="polite">
      <template v-if="status === 'checking'">
        <h1>Confirmando tu correo</h1>
        <p>Estamos verificando el enlace. Te llevaremos al portal en un momento.</p>
      </template>
      <template v-else-if="status === 'error'">
        <h1>No se pudo confirmar el correo</h1>
        <p>Comprueba tu conexión e inténtalo nuevamente.</p>
        <button class="retry-button" type="button" @click="verify">Intentar de nuevo</button>
      </template>
      <template v-else>
        <h1>Este enlace ya no es válido</h1>
        <p>Puede haber expirado o ya se utilizó. Solicita un nuevo enlace para continuar.</p>
        <form class="resend-form" @submit.prevent="resend">
          <label for="verification-email">Correo electrónico</label>
          <input
            id="verification-email"
            v-model="email"
            type="email"
            autocomplete="email"
            maxlength="150"
            required
          />
          <p v-if="resendMessage" class="message-success" role="status">
            {{ resendMessage }}
          </p>
          <p v-if="resendError" class="message-error" role="alert">{{ resendError }}</p>
          <button type="submit" :disabled="resendLoading">
            {{ resendLoading ? 'Solicitando…' : 'Solicitar un enlace nuevo' }}
          </button>
        </form>
      </template>
    </section>
  </main>
  <AppFooter />
</template>

<style scoped>
.verification-page {
  display: grid;
  min-height: 55vh;
  place-items: center;
  padding: 40px 16px;
  background: var(--color-background);
}

.verification-card {
  width: min(100%, 480px);
  padding: clamp(24px, 5vw, 40px);
  border: 1px solid #e5e5e5;
  border-radius: var(--radius-medium);
  background: var(--color-white);
  box-shadow: 0 8px 28px rgb(0 0 0 / 8%);
}

.verification-card h1 {
  margin: 0 0 12px;
  color: var(--color-primary);
  font-size: clamp(1.4rem, 4vw, 1.8rem);
}

.verification-card > p {
  color: var(--color-dark);
  line-height: 1.6;
}

.resend-form {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}

.resend-form input {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid #aaa;
  border-radius: var(--radius-small);
}

.resend-form button {
  min-height: 44px;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius-small);
  background: var(--color-primary);
  color: var(--color-white);
  font-weight: 700;
}

.retry-button {
  min-height: 44px;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--radius-small);
  background: var(--color-primary);
  color: var(--color-white);
  font-weight: 700;
}

.resend-form button:disabled {
  opacity: 0.65;
}

.message-success,
.message-error {
  margin: 0;
  font-size: 0.9rem;
}

.message-success {
  color: #206a3b;
}

.message-error {
  color: var(--color-error);
}
</style>
