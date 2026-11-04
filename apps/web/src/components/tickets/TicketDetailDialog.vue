<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue'
import TicketDialogShell from './TicketDialogShell.vue'
import type { TicketDetail } from '@/types/ticket'
import { formatTicketDate } from '@/utils/ticket-format'

const props = withDefaults(defineProps<{ ticket: TicketDetail | null; error?: string }>(), {
  error: '',
})
const emit = defineEmits<{ close: [] }>()
const shell = useTemplateRef('shell')

function syncDialog() {
  if (props.ticket || props.error) shell.value?.open()
  else shell.value?.close()
}

function closeDialog() {
  shell.value?.close()
  emit('close')
}

onMounted(syncDialog)
watch(() => [props.ticket, props.error], syncDialog, { flush: 'post' })
</script>

<template>
  <TicketDialogShell
    ref="shell"
    title="Detalle de boleto"
    close-label="Cerrar"
    @close="emit('close')"
  >
    <div v-if="ticket || error" class="ticket-detail-content">
      <p v-if="!ticket" class="detail-error" role="alert">{{ error }}</p>
      <template v-else>
        <section class="detail-group">
          <h3>Información del boleto</h3>
          <dl class="detail-grid">
            <div class="detail-field">
              <dt>ID</dt>
              <dd>{{ ticket.id }}</dd>
            </div>
            <div class="detail-field">
              <dt>Película</dt>
              <dd>{{ ticket.title }}</dd>
            </div>
            <div class="detail-field">
              <dt>Sala</dt>
              <dd>{{ ticket.theaterId }}</dd>
            </div>
            <div class="detail-field">
              <dt>Inicio</dt>
              <dd>{{ formatTicketDate(ticket.startTime) }}</dd>
            </div>
            <div class="detail-field">
              <dt>Finalización</dt>
              <dd>{{ formatTicketDate(ticket.endTime) }}</dd>
            </div>
            <div class="detail-field">
              <dt>Asiento</dt>
              <dd>{{ ticket.seat }}</dd>
            </div>
          </dl>
        </section>
      </template>
      <footer class="dialog-actions">
        <button type="button" class="secondary-button" @click="closeDialog">Cerrar</button>
      </footer>
    </div>
  </TicketDialogShell>
</template>

<style scoped>
.ticket-detail-content {
  display: flex;
  flex-direction: column;
  padding: var(--dialog-content-padding);
  overflow-y: auto;
  font: inherit;
}
.detail-error {
  margin: 0;
  color: var(--color-error);
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 42px;
}
.secondary-button {
  width: 118px;
  height: 40px;
  padding: 12px 14px;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  box-shadow: 0 4px 4px 0 var(--shadow-strong-color);
  color: var(--text-primary);
  background: var(--content-background);
  font: inherit;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}
</style>
