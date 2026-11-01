<script setup lang="ts">
import { useBlurValidation } from '@/composables/useBlurValidation'
import { ref, useId, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { validEmail } from '@/utils/user-validation'

const shouldValidateOnBlur = useBlurValidation()

const props = defineProps<{
  open: boolean
  currentEmail: string
  pending?: boolean
  error?: string
}>()
const emit = defineEmits<{ request: [email: string]; close: [] }>()
const email = ref('')
const validation = ref('')
const fieldId = useId()
watch(
  () => props.open,
  () => {
    email.value = ''
    validation.value = ''
  },
)
function validate() {
  const normalized = email.value.trim().toLowerCase()
  validation.value = !validEmail(normalized)
    ? 'Escribe un correo electrónico válido, por ejemplo nombre@correo.com.'
    : normalized === props.currentEmail
      ? 'Escribe un correo diferente al actual.'
      : ''
  return !validation.value
}
function submit() {
  if (!props.pending && validate()) emit('request', email.value.trim().toLowerCase())
}
</script>

<template>
  <BaseModal
    :open="open"
    title="Cambiar correo electrónico"
    :close-disabled="pending"
    @close="emit('close')"
  >
    <form novalidate @submit.prevent="submit">
      <p>
        Enviaremos un enlace al nuevo correo. Tu correo actual se mantendrá hasta que lo confirmes.
      </p>
      <p class="notice">
        El enlace vence en 30 minutos. Al confirmar el cambio se cerrarán tus sesiones y deberás
        iniciar sesión con el nuevo correo.
      </p>
      <label :for="fieldId">Nuevo correo electrónico</label>
      <input
        :id="fieldId"
        v-model="email"
        type="email"
        autocomplete="email"
        :disabled="pending"
        :aria-invalid="Boolean(validation)"
        :aria-describedby="`${fieldId}-feedback`"
        @blur="shouldValidateOnBlur($event) && validate()"
        @input="validation = ''"
      />
      <p :id="`${fieldId}-feedback`" class="error" aria-live="polite">{{ validation }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" :disabled="pending" @click="emit('close')">Cancelar</button
        ><button class="primary" type="submit" :disabled="pending">
          {{ pending ? 'Enviando…' : 'Enviar confirmación' }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
p {
  color: var(--text-secondary);
  line-height: 1.6;
}
.notice {
  background: var(--warning-background);
  padding: 0.75rem;
  border-radius: var(--radius-small);
}
label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.4rem;
}
input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border-strong);
  background: var(--input-background);
  color: var(--text-primary);
  border-radius: var(--radius-small);
  padding: 0.6rem;
}
.error {
  color: var(--error-color);
  font-size: 0.9rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}
button {
  min-height: 44px;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-small);
  border: 1px solid var(--border-strong);
  background: var(--button-secondary-background);
  color: var(--button-secondary-text);
}
.primary {
  background: var(--button-confirm-background);
  color: var(--button-confirm-text);
  border-color: transparent;
}
:disabled {
  opacity: 0.65;
}
:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
</style>
