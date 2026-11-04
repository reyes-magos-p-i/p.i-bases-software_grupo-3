<script setup lang="ts">
import BaseModal from './BaseModal.vue'
withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    pending?: boolean
    danger?: boolean
  }>(),
  { confirmLabel: 'Confirmar' },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <BaseModal :open="open" :title="title" :close-disabled="pending" @close="emit('cancel')">
    <div class="confirmation-content">
      <p>{{ message }}</p>
      <div class="confirmation-actions">
        <button type="button" :disabled="pending" @click="emit('cancel')">Cancelar</button>
        <button
          type="button"
          class="confirm"
          :class="{ danger }"
          :disabled="pending"
          @click="emit('confirm')"
        >
          {{ pending ? 'Procesando…' : confirmLabel }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
p {
  color: var(--text-secondary);
  line-height: 1.6;
}
.confirmation-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
button {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  min-height: 44px;
  padding: 0.6rem 1rem;
  background: var(--button-secondary-background);
  color: var(--button-secondary-text);
}
.confirm {
  background: var(--button-confirm-background);
  color: var(--button-confirm-text);
  border-color: transparent;
}
.danger {
  background: var(--error-color);
  color: var(--text-on-dark);
}
button:disabled {
  opacity: 0.65;
}
button:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
</style>
