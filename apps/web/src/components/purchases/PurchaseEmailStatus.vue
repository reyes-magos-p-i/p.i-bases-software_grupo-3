<script setup lang="ts">
import { computed } from 'vue'
import type { TicketEmailStatus } from '@/types/purchase'
const props = defineProps<{
  status: TicketEmailStatus | null
  busy: boolean
  checking: boolean
  seconds: number
  error: string
}>()
defineEmits<{ resend: []; check: [] }>()
const waiting = computed(
  () => props.status?.status === 'PENDING' || props.status?.status === 'SENDING',
)
</script>
<template>
  <section class="purchase-email" aria-label="Envío de boletos" aria-live="polite">
    <h2>Tus boletos por correo</h2>
    <p v-if="error">{{ error }}</p>
    <p v-else-if="status?.status === 'SENT'">
      Enviamos tus boletos a <strong>{{ status.recipient }}</strong
      >. Revisa también la carpeta de correo no deseado.
    </p>
    <p v-else-if="status?.status === 'FAILED'">
      No se pudieron enviar tus boletos por correo. Tu compra sigue registrada y puedes verlos aquí.
    </p>
    <p v-else-if="status?.status === 'UNKNOWN'">
      No pudimos confirmar el envío. Revisa tu correo antes de solicitar otro; tus boletos siguen
      disponibles aquí.
    </p>
    <p v-else-if="status?.status === 'NOT_REQUESTED'">
      Puedes enviar los boletos de esta compra a tu correo.
    </p>
    <p v-else>Estamos preparando el envío de tus boletos. Puedes seguir consultando tu compra.</p>
    <div class="email-actions">
      <button
        v-if="status && !waiting && !error"
        type="button"
        class="purchase-action primary"
        :disabled="busy || checking || seconds > 0"
        @click="$emit('resend')"
      >
        {{
          busy
            ? 'Solicitando envío...'
            : status.status === 'NOT_REQUESTED'
              ? 'Enviar boletos'
              : 'Reenviar boletos'
        }}
      </button>
      <button
        v-if="waiting || error || !status"
        type="button"
        class="purchase-action"
        :disabled="checking || busy"
        @click="$emit('check')"
      >
        {{ checking ? 'Comprobando envío...' : 'Comprobar envío' }}
      </button>
      <span v-if="seconds > 0 && !waiting">Podrás reenviar en {{ seconds }} s.</span>
    </div>
  </section>
</template>
<style scoped>
.purchase-email {
  padding: 20px;
  margin: 24px 0;
  border: 1px solid var(--border-on-dark);
  border-radius: var(--radius-small);
  background: var(--surface-background);
  color: var(--text-on-dark);
}
.purchase-email h2 {
  font-size: 1.2rem;
}
.email-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
