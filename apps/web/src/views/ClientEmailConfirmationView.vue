<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { clientProfileError, confirmClientEmailChange } from '@/services/client-profile.service'
import {
  clearClientAuth,
  clientSession,
  clientSessionRevision,
} from '@/services/client-session.service'

const route = useRoute()
const token = ref(route.hash.slice(1))
const pending = ref(false)
const success = ref(false)
const error = ref('')
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  token.value = ''
})
async function confirm() {
  if (pending.value || success.value) return
  if (!token.value || token.value.length > 4096) {
    error.value = 'El enlace no es válido. Solicita otro cambio de correo desde tu perfil.'
    return
  }
  const revision = clientSessionRevision()
  pending.value = true
  error.value = ''
  try {
    const result = await confirmClientEmailChange(token.value)
    if (disposed) return
    if (revision === clientSessionRevision() && clientSession.user.value?.id === result.clientId)
      await clearClientAuth().catch(() => undefined)
    token.value = ''
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    )
    success.value = true
  } catch (error_) {
    if (!disposed)
      error.value = clientProfileError(
        error_,
        'No se pudo confirmar el correo. Intenta nuevamente o solicita un nuevo enlace desde tu perfil.',
      )
  } finally {
    if (!disposed) pending.value = false
  }
}
</script>

<template>
  <AppHeader />
  <main class="confirmation-page">
    <section class="confirmation-card">
      <i :class="['bi', success ? 'bi-envelope-check' : 'bi-envelope']" aria-hidden="true"></i>
      <h1>{{ success ? 'Correo actualizado' : 'Confirma tu nuevo correo' }}</h1>
      <template v-if="success"
        ><p>
          Tu correo se actualizó y se cerraron las sesiones anteriores. Ya puedes iniciar sesión con
          el nuevo correo.
        </p>
        <RouterLink :to="{ path: '/', query: { login: 'client' } }"
          >Iniciar sesión</RouterLink
        ></template
      >
      <template v-else
        ><p>
          Al confirmar, este correo se vinculará a tu cuenta y se cerrarán tus sesiones. El enlace
          vence 30 minutos después de solicitarlo y solo puede usarse una vez.
        </p>
        <p>Si no solicitaste este cambio, cierra esta página. Tu correo actual se mantendrá.</p>
        <button type="button" :disabled="pending" @click="confirm">
          {{ pending ? 'Confirmando…' : 'Confirmar nuevo correo' }}</button
        ><RouterLink to="/account/profile">Volver a mi perfil</RouterLink></template
      >
      <NotificationPopup
        v-if="error"
        type="error"
        :message="error"
        :duration="0"
        @close="error = ''"
      />
    </section>
  </main>
  <AppFooter />
</template>

<style scoped>
.confirmation-page {
  display: grid;
  place-items: center;
  min-height: 65vh;
  padding: 2rem 1rem;
}
.confirmation-card {
  width: min(100%, 560px);
  padding: 2rem;
  text-align: center;
  border-radius: var(--radius-large);
  background: var(--content-background);
  color: var(--text-primary);
}
.confirmation-card > i {
  display: block;
  font-size: 3rem;
  color: var(--primary-color);
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.75rem;
  font-weight: 700;
}
p {
  color: var(--text-secondary);
  line-height: 1.6;
}
button,
a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0.7rem 1rem;
  margin: 0.4rem;
  border: 0;
  border-radius: var(--radius-small);
  background: var(--button-background);
  color: var(--button-text);
  font-weight: 600;
  text-decoration: none;
}
button:disabled {
  opacity: 0.65;
}
:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
</style>
