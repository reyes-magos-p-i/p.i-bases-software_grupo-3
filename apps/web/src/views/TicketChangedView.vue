<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { getCancelledTicket } from '@/services/cancelled-ticket.service'
import { formatSeat, formatShowDate, formatShowTime } from '@/utils/cancelled-ticket-format'
import type { CancelledTicket } from '@/types/cancelled-ticket'

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
  <main class="changed">
    <h1>Tu proyección fue cambiada</h1>

    <LoadingState v-if="loading" message="Cargando tu nueva proyección..." surface="dark" />

    <section v-else-if="brokenLink" class="changed__card" role="alert">
      <h2>Este enlace no funciona</h2>
      <p>Lamentamos las molestias. No encontramos el cambio de este boleto.</p>
      <RouterLink to="/account/profile?section=purchases">Ver mis compras</RouterLink>
    </section>

    <section v-else-if="ticket" class="changed__card">
      <h2>Nueva proyección</h2>
      <dl class="changed__detail">
        <div>
          <dt>Película</dt>
          <dd>{{ ticket.title }}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{{ formatShowDate(ticket.startsAt) }}</dd>
        </div>
        <div>
          <dt>Sucursal</dt>
          <dd>{{ ticket.branchName }}</dd>
        </div>
        <div>
          <dt>Hora</dt>
          <dd>{{ formatShowTime(ticket.startsAt) }}</dd>
        </div>
        <div>
          <dt>Sala</dt>
          <dd>{{ ticket.theaterId }}</dd>
        </div>
        <div>
          <dt>Código de boleto</dt>
          <dd>{{ ticket.id }}</dd>
        </div>
        <div>
          <dt>Asiento</dt>
          <dd>{{ formatSeat(ticket.seatRow, ticket.seatColumn) }}</dd>
        </div>
      </dl>
    </section>
  </main>
  <AppFooter />
</template>

<style scoped>
.changed {
  background: var(--page-background);
  color: var(--text-on-dark);
  min-height: 70vh;
  padding: 48px 16px;
  text-align: center;
}

.changed h1 {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  margin: 0 0 40px;
}

.changed__card {
  background: var(--content-background);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  max-width: 560px;
  margin: 0 auto;
  padding: 32px;
  text-align: left;
}

.changed__card h2 {
  font-size: 21.6px;
  font-weight: 700;
  margin: 0 0 16px;
}

.changed__detail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px 24px;
  margin: 0;
}

.changed__detail dt {
  font-size: 14.7px;
  font-weight: 600;
  color: var(--text-secondary);
}

.changed__detail dd {
  margin: 4px 0 0;
}
</style>
