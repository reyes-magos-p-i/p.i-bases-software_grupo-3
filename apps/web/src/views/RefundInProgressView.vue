<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { getCancelledTicket } from '@/services/cancelled-ticket.service'
import type { CancelledTicket } from '@/types/cancelled-ticket'

const REFUND_ESTIMATE = '5 a 10 días hábiles'
const route = useRoute()
const ticket = ref<CancelledTicket | null>(null)
const loading = ref(true)
const brokenLink = ref(false)

onMounted(async () => {
  try {
    ticket.value = (await getCancelledTicket(Number(route.params.ticketId))).ticket
  } catch {
    brokenLink.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppHeader />
  <main class="refund">
    <h1>Tu devolución está en proceso</h1>

    <LoadingState v-if="loading" message="Cargando tu devolución..." surface="dark" />

    <section v-else-if="brokenLink" class="refund__card" role="alert">
      <h2>Este enlace no funciona</h2>
      <p>Lamentamos las molestias. No encontramos la devolución de este boleto.</p>
      <RouterLink to="/account/profile?section=purchases">Ver mis compras</RouterLink>
    </section>

    <section v-else-if="ticket" class="refund__card">
      <h2>Procesamos tu devolución</h2>
      <p>
        Tu devolución se está procesando. El monto se reembolsará al mismo método de pago que
        usaste.
      </p>
      <dl class="refund__detail">
        <div>
          <dt>Código de boleto</dt>
          <dd>{{ ticket.id }}</dd>
        </div>
        <div>
          <dt>Tiempo estimado</dt>
          <dd>{{ REFUND_ESTIMATE }}</dd>
        </div>
      </dl>
    </section>
  </main>
  <AppFooter />
</template>

<style scoped>
.refund {
  background: var(--page-background);
  color: var(--text-on-dark);
  min-height: 70vh;
  padding: 48px 16px;
  text-align: center;
}

.refund h1 {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  margin: 0 0 40px;
}

.refund__card {
  background: var(--content-background);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  max-width: 560px;
  margin: 0 auto;
  padding: 32px;
  text-align: left;
}

.refund__card h2 {
  font-size: 21.6px;
  font-weight: 700;
  margin: 0 0 12px;
}

.refund__detail {
  display: grid;
  gap: 16px;
  margin: 24px 0 0;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.refund__detail div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.refund__detail dt {
  font-weight: 600;
  color: var(--text-secondary);
}

.refund__detail dd {
  margin: 0;
  font-weight: 600;
}
</style>
