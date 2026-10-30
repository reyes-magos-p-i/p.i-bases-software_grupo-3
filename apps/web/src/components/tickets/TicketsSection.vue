<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import CrudTable from '@/components/crudTable/CrudTable.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
// Unwired: ticket detail modal
// import TicketDetailDialog from './TicketDetailDialog.vue'
import { useEmployeeSessionRecovery } from '@/composables/useEmployeeSessionRecovery'
import { getTicket } from '@/services/ticket.service'
import type { Ticket } from '@/types/ticket'
import { formatTicketDate } from '@/utils/ticket-format'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const { sessionExpired, refreshPermissions } = useEmployeeSessionRecovery()

const ticketNumber = ref('')
const searching = ref(false)
const searchError = ref('')
const notification = ref('')
const searchedNumber = ref<number | null>(null)
const ticket = ref<Ticket | null>(null)
// const selectedTicket = ref<TicketDetail | null>(null)
// const detailError = ref('')
let request: AbortController | undefined

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Película' },
  { key: 'theaterId', label: 'Sala' },
  { key: 'startTime', label: 'Inicio' },
  { key: 'endTime', label: 'Finalización' },
  { key: 'seat', label: 'Asiento' },
]

// Unwired: detail modal handlers (import type TicketDetail from '@/types/ticket' to restore)
// function viewTicket() {
//   if (!ticket.value || searchedNumber.value === null) {
//     selectedTicket.value = null
//     detailError.value = 'No se pudo mostrar el detalle del ticket.'
//     return
//   }
//   selectedTicket.value = { ...ticket.value, id: searchedNumber.value }
//   detailError.value = ''
// }
//
// function closeDetail() {
//   selectedTicket.value = null
//   detailError.value = ''
// }

const rows = computed(() => {
  if (!ticket.value || searchedNumber.value === null) return []
  return [
    {
      id: searchedNumber.value,
      title: ticket.value.title,
      theaterId: ticket.value.theaterId,
      startTime: formatTicketDate(ticket.value.startTime),
      endTime: formatTicketDate(ticket.value.endTime),
      seat: ticket.value.seat,
    },
  ]
})

async function search() {
  if (props.disabled || searching.value) return
  notification.value = ''
  const number = ticketNumber.value.trim()
  if (!/^\d+$/.test(number) || Number(number) < 1) {
    notification.value = 'Ingresa un número de ticket válido.'
    return
  }

  request?.abort()
  const current = new AbortController()
  request = current
  searching.value = true
  searchError.value = ''
  ticket.value = null
  searchedNumber.value = null
  emit('busy', true)
  try {
    const result = await getTicket(Number(number), current.signal)
    if (current.signal.aborted) return
    searchedNumber.value = Number(number)
    if (result) ticket.value = result
    else notification.value = 'El ticket no existe'
  } catch (error) {
    if (current.signal.aborted) return
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status === 401) sessionExpired()
    else if (status === 403) {
      searchError.value = 'No tienes permiso para consultar tickets.'
      void refreshPermissions()
    } else searchError.value = 'No se pudo consultar el ticket. Inténtalo nuevamente.'
  } finally {
    if (request === current) {
      searching.value = false
      request = undefined
      emit('busy', false)
    }
  }
}

// Changing the number invalidates the previous result so the table never shows a stale ticket.
watch(ticketNumber, () => {
  if (searchedNumber.value !== null && ticketNumber.value.trim() !== String(searchedNumber.value)) {
    ticket.value = null
    searchedNumber.value = null
  }
})

onBeforeUnmount(() => {
  request?.abort()
})
</script>

<template>
  <section class="preview-content" aria-live="polite" aria-atomic="true">
    <div class="section-heading">
      <div>
        <h1>Consulta de ticket</h1>
        <p class="section-subtitle">Ingresa el número de ticket para ver sus datos</p>
      </div>
    </div>

    <form class="ticket-search" role="search" @submit.prevent="search">
      <label for="ticket-number" class="ticket-search-label">Número de ticket</label>
      <div class="ticket-search-row">
        <input
          id="ticket-number"
          v-model="ticketNumber"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="ticket-search-input"
          :disabled="disabled || searching"
          :aria-invalid="searchError ? 'true' : undefined"
          aria-describedby="ticket-search-feedback"
        />
        <button type="submit" class="add-user-button" :disabled="disabled || searching">
          Buscar
        </button>
      </div>
    </form>

    <p id="ticket-search-feedback" class="ticket-feedback">
      <span v-if="searchError" class="ticket-error" role="alert">{{ searchError }}</span>
    </p>

    <LoadingState v-if="searching" message="Consultando el ticket…" />

    <div v-if="notification" class="ticket-notification">
      <NotificationPopup
        type="alert"
        :message="notification"
        :duration="1000"
        @close="notification = ''"
      />
    </div>

    <CrudTable
      v-else-if="ticket"
      caption="Tickets"
      :columns="columns"
      :rows="rows"
      class="ticket-table"
    >
      <template #actions>
        <div class="default-actions">
          <span title="Modificar" class="action-hint">
            <button type="button" aria-label="Modificar">
              <i class="bi bi-pencil-square" aria-hidden="true"></i>
            </button>
          </span>
        </div>
      </template>
      <!-- Unwired: view-detail (eye) action
        <span title="Ver detalle" class="action-hint">
          <button type="button" aria-label="Ver detalle" @click="viewTicket">
            <i class="bi bi-eye" aria-hidden="true"></i>
          </button>
        </span>
      -->
    </CrudTable>

    <!-- Unwired: <TicketDetailDialog :ticket="selectedTicket" :error="detailError" @close="closeDetail" /> -->
  </section>
</template>

<style scoped>
.section-subtitle {
  margin: 4px 0 0;
  color: var(--text-on-dark-secondary);
}
.ticket-search {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
}
.ticket-search-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-on-dark);
}
.ticket-search-row {
  display: flex;
  gap: 12px;
  align-items: stretch;
}
.ticket-search-input {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  padding: 11px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--input-background);
  color: var(--text-primary);
}
.ticket-search-input:focus-visible {
  outline: 2px solid var(--focus-on-dark);
  outline-offset: 2px;
}
.ticket-search-row .add-user-button {
  flex-shrink: 0;
}
.ticket-feedback {
  min-height: 1.5em;
  margin: 0 0 16px;
  color: var(--text-on-dark-secondary);
}
.default-actions {
  display: flex;
  gap: 4px;
}
.default-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  width: 36px;
  min-height: 36px;
  padding: 8px;
  border: 0;
  color: var(--text-primary);
  background: transparent;
  font-size: 1.125rem;
  text-decoration: none;
}
.default-actions button:not(:disabled):hover {
  background: var(--input-disabled-background);
  color: var(--text-primary);
}
.action-hint {
  display: inline-flex;
}
.ticket-notification {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 1050;
}
.ticket-error {
  display: inline-block;
  padding: 8px 12px;
  border-left: 4px solid var(--error-color);
  border-radius: var(--radius-small);
  background: var(--error-background);
  color: var(--error-text);
}
</style>
