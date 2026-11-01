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

onMounted(syncDialog)
watch(() => [props.ticket, props.error], syncDialog, { flush: 'post' })
</script>

<template>
  <TicketDialogShell ref="shell" title="Detalle de tiquete" close-label="Cerrar" @close="emit('close')">
    <div v-if="ticket || error" class="ticket-detail-content">
      <p v-if="!ticket" class="detail-error" role="alert">{{ error }}</p>
      <template v-else>
        <div class="detail-grid">
          <div class="readonly-field"><label>ID</label><div class="readonly-input">{{ ticket.id }}</div></div>
          <div class="readonly-field"><label>Película</label><div class="readonly-input">{{ ticket.title }}</div></div>
          <div class="readonly-field"><label>Sala</label><div class="readonly-input">{{ ticket.theaterId }}</div></div>
          <div class="readonly-field"><label>Inicio</label><div class="readonly-input">{{ formatTicketDate(ticket.startTime) }}</div></div>
          <div class="readonly-field"><label>Finalización</label><div class="readonly-input">{{ formatTicketDate(ticket.endTime) }}</div></div>
          <div class="readonly-field"><label>Asiento</label><div class="readonly-input">{{ ticket.seat }}</div></div>
        </div>
        <footer class="dialog-actions">
          <button type="button" class="secondary-button" @click="shell?.close(); emit('close')">Cerrar</button>
        </footer>
      </template>
    </div>
  </TicketDialogShell>
</template>

<style scoped>
.ticket-detail-content {
  display: flex;
  flex-direction: column;
  padding: 15px 36px 17px 13px;
  overflow-y: auto;
  font: inherit;
}
.detail-error {
  margin: 0;
  color: var(--color-error);
}
.detail-grid {
  display: grid;
  gap: 11px;
}
.readonly-field {
  display: grid;
  gap: 6px;
}
.readonly-field label {
  font-size: 14px;
  font-weight: 500;
  line-height: normal;
}
.readonly-input {
  display: flex;
  align-items: center;
  height: 42px;
  padding: 0 12px;
  border: 0.5px solid var(--text-primary);
  border-radius: 4px;
  font-size: 14px;
  background: var(--content-background);
  color: var(--text-primary);
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
  box-shadow: 0 4px 4px 0 rgba(0, 0, 0, 0.25);
  color: var(--text-primary);
  background: var(--content-background);
  font: inherit;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}
</style>
