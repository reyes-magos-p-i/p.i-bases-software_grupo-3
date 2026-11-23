<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import {
  changeTicketShowtime,
  getCancelledTicket,
  requestTicketRefund,
} from '@/services/cancelled-ticket.service'
import { authErrorMessage } from '@/utils/auth-errors'
import { formatSeat, formatShowDate, formatShowTime } from '@/utils/cancelled-ticket-format'
import type { CancelledTicketDetail } from '@/types/cancelled-ticket'

const route = useRoute()
const router = useRouter()
const ticketId = Number(route.params.ticketId)

const detail = ref<CancelledTicketDetail | null>(null)
const loading = ref(true)
const brokenLink = ref(false)
const selectedFunctionId = ref<number | null>(null)
const submitting = ref<'change' | 'refund' | null>(null)
const error = ref('')
let controller: AbortController | undefined

const ticket = computed(() => detail.value?.ticket ?? null)
const alternatives = computed(() => detail.value?.alternatives ?? [])
const isCancelled = computed(() => ticket.value?.functionStatus === 'CANCELLED')

function alternativeLabel(alternative: CancelledTicketDetail['alternatives'][number]) {
  return `${alternative.date}, ${alternative.time}`
}

async function load() {
  controller?.abort()
  controller = new AbortController()
  const request = controller
  loading.value = true
  brokenLink.value = false
  try {
    const data = await getCancelledTicket(ticketId, request.signal)
    if (request.signal.aborted) return
    detail.value = data
    selectedFunctionId.value = data.alternatives[0]?.movieFunctionId ?? null
  } catch {
    if (request.signal.aborted) return
    detail.value = null
    brokenLink.value = true
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}

async function confirmChange() {
  if (!selectedFunctionId.value || submitting.value) return
  submitting.value = 'change'
  error.value = ''
  try {
    await changeTicketShowtime(ticketId, selectedFunctionId.value)
    await router.push({ name: 'cancelled-ticket-changed', params: { ticketId } })
  } catch (caught) {
    error.value = authErrorMessage(caught, 'No pudimos cambiar tu boleto. Intenta de nuevo.')
  } finally {
    submitting.value = null
  }
}

async function requestRefund() {
  if (submitting.value) return
  submitting.value = 'refund'
  error.value = ''
  try {
    await requestTicketRefund(ticketId)
    await router.push({ name: 'cancelled-ticket-refund', params: { ticketId } })
  } catch (caught) {
    error.value = authErrorMessage(caught, 'No pudimos registrar tu devolución. Intenta de nuevo.')
  } finally {
    submitting.value = null
  }
}

onMounted(load)
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <AppHeader />
  <main class="cancelled-ticket">
    <header class="cancelled-ticket__intro">
      <h1>Tu proyección fue cancelada</h1>
      <p>Elige cómo quieres continuar con tu boleto.</p>
    </header>

    <LoadingState v-if="loading" message="Cargando tu boleto..." surface="dark" />

    <section v-else-if="brokenLink" class="cancelled-ticket__broken" role="alert">
      <h2>Este enlace no funciona</h2>
      <p>
        Lamentamos las molestias. No encontramos un boleto cancelado asociado a este enlace, o el
        boleto no pertenece a tu cuenta.
      </p>
      <RouterLink to="/account/profile?section=purchases" class="cancelled-ticket__link">
        Ver mis compras
      </RouterLink>
    </section>

    <div v-else-if="ticket" class="cancelled-ticket__grid">
      <article class="card">
        <h2>Detalles de tu boleto</h2>
        <dl>
          <div>
            <dt>Código de boleto</dt>
            <dd class="card__code">{{ ticket.id }}</dd>
          </div>
          <div>
            <dt>Película</dt>
            <dd>{{ ticket.title }}</dd>
          </div>
          <div>
            <dt>Sucursal</dt>
            <dd>{{ ticket.branchName }}</dd>
          </div>
          <div>
            <dt>Fecha y hora</dt>
            <dd>
              {{ formatShowDate(ticket.startsAt) }} {{ formatShowTime(ticket.startsAt) }}
            </dd>
          </div>
          <div>
            <dt>Asiento</dt>
            <dd>{{ formatSeat(ticket.seatRow, ticket.seatColumn) }}</dd>
          </div>
          <div>
            <dt>Sala</dt>
            <dd>{{ ticket.theaterId }}</dd>
          </div>
        </dl>
      </article>

      <article class="card">
        <h2>Elige una alternativa</h2>

        <p v-if="!isCancelled" class="card__note">
          La proyección de este boleto ya no está cancelada. Consulta tu compra para ver los
          detalles actuales.
        </p>

        <template v-else>
          <section class="option">
            <h3>Cambiar de proyección</h3>
            <p class="option__hint">
              Elige otra proyección de la misma película en la misma sucursal.
            </p>

            <template v-if="alternatives.length">
              <label for="alternative-showtime">Fecha y hora</label>
              <select
                id="alternative-showtime"
                v-model.number="selectedFunctionId"
                :disabled="submitting !== null"
              >
                <option v-for="option in alternatives" :key="option.movieFunctionId" :value="option.movieFunctionId">
                  {{ alternativeLabel(option) }}
                </option>
              </select>
              <button
                type="button"
                class="button button--primary"
                :disabled="submitting !== null || !selectedFunctionId"
                @click="confirmChange"
              >
                {{ submitting === 'change' ? 'Confirmando...' : 'Confirmar cambio' }}
              </button>
            </template>
            <p v-else class="option__hint">
              No hay otras proyecciones disponibles de esta película en los próximos 7 días.
            </p>
          </section>

          <section class="option">
            <h3>Devolución de mi dinero</h3>
            <p class="option__hint">Te devolvemos el monto pagado por este boleto.</p>
            <button
              type="button"
              class="button button--outline"
              :disabled="submitting !== null"
              @click="requestRefund"
            >
              {{ submitting === 'refund' ? 'Procesando...' : 'Pedir devolución' }}
            </button>
          </section>
        </template>
      </article>
    </div>

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
.cancelled-ticket {
  background: var(--page-background);
  color: var(--text-on-dark);
  min-height: 70vh;
  padding: 48px 16px;
}

.cancelled-ticket__intro {
  text-align: center;
  margin-bottom: 40px;
}

.cancelled-ticket__intro h1 {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  margin: 0 0 8px;
}

.cancelled-ticket__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 466px));
  justify-content: center;
  gap: 32px;
}

.card {
  background: var(--content-background);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 36px;
}

.card h2 {
  font-size: 21.6px;
  font-weight: 700;
  margin: 0 0 24px;
}

.card dl {
  display: grid;
  gap: 20px;
  margin: 0;
}

.card dt {
  font-size: 14.7px;
  font-weight: 600;
  color: var(--text-secondary);
}

.card dd {
  margin: 4px 0 0;
  font-size: 16px;
}

.card__code {
  font-size: 24px;
  font-weight: 700;
}

.card__note {
  color: var(--text-secondary);
}

.option {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
  display: grid;
  gap: 10px;
}

.option h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.option__hint {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

.option label {
  font-size: 14.7px;
  font-weight: 600;
}

.option select {
  padding: 12px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-size: 16px;
  background: var(--input-background);
}

.button {
  min-height: 44px;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button--primary {
  background: var(--primary-color);
  border: none;
  color: #fff;
}

.button--outline {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
}

.cancelled-ticket__broken {
  max-width: 560px;
  margin: 0 auto;
  text-align: center;
}

.cancelled-ticket__link {
  color: var(--accent-color);
}
</style>
