<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue'
import TicketDialogShell from './TicketDialogShell.vue'
import type { TicketDetail } from '@/types/ticket'

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
  <TicketDialogShell ref="shell" title="Detalle de ticket" close-label="Cerrar" @close="emit('close')">
    <div v-if="ticket || error" class="ticket-detail-content">
      <p v-if="!ticket" class="detail-error" role="alert">{{ error }}</p>
      <div v-else class="detail-grid">
        <div class="readonly-field"><label>Número de ticket</label><div class="readonly-input">{{ ticket.id }}</div></div>
        <div class="readonly-field"><label>Película</label><div class="readonly-input">{{ ticket.title }}</div></div>
        <div class="readonly-field"><label>Sala</label><div class="readonly-input">{{ ticket.theaterId }}</div></div>
        <div class="dimension-grid">
          <div class="readonly-field"><label>Inicio</label><div class="readonly-input">{{ ticket.startTime }}</div></div>
          <div class="readonly-field"><label>Finalización</label><div class="readonly-input">{{ ticket.endTime }}</div></div>
        </div>
        <div class="readonly-field"><label>Asiento</label><div class="readonly-input">{{ ticket.seat }}</div></div>
      </div>
      <footer class="dialog-actions">
        <button type="button" class="secondary-button" @click="shell?.close(); emit('close')">Cerrar</button>
      </footer>
    </div>
  </TicketDialogShell>
</template>

<style scoped>
.ticket-detail-content {
  display: grid;
  gap: 8px;
  padding: 24px;
  overflow-y: auto;
  font: inherit;
}
.detail-error {
  margin: 0;
  color: var(--color-error);
}
.detail-grid {
  display: grid;
  gap: 8px;
}
.dimension-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 8px;
}
.readonly-field {
  display: grid;
  gap: 8px;
}
.readonly-input {
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  font: inherit;
  background: var(--content-background);
  color: var(--text-primary);
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
.secondary-button {
  min-height: 42px;
  padding: 9px 16px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  color: var(--text-primary);
  background: var(--content-background);
  font: inherit;
}
@media (max-width: 520px) {
  .dimension-grid {
    grid-template-columns: 1fr;
  }
}
</style>
