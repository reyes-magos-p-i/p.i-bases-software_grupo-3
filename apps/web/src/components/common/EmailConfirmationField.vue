<script setup lang="ts">
import { nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useBlurValidation } from '@/composables/useBlurValidation'
import { validEmail } from '@/utils/user-validation'

const props = defineProps<{ expectedEmail?: string; disabled?: boolean }>()
const id = useId()
const input = useTemplateRef<HTMLInputElement>('input')
const email = ref('')
const error = ref('')
const shouldValidate = useBlurValidation()
watch(
  () => props.expectedEmail,
  () => {
    email.value = ''
    error.value = ''
  },
)

function validate(focus = true): string | null {
  const value = email.value.trim().toLowerCase()
  error.value = !value
    ? 'Escribe el correo de tu sesión para confirmar esta acción.'
    : !validEmail(value)
      ? 'Escribe un correo electrónico válido, por ejemplo nombre@correo.com.'
      : props.expectedEmail && value !== props.expectedEmail.trim().toLowerCase()
        ? 'El correo debe coincidir con el de tu sesión.'
        : ''
  if (!error.value) return value
  if (focus) void nextTick(() => input.value?.focus({ preventScroll: true }))
  return null
}
function onBlur(event: FocusEvent) {
  if (shouldValidate(event) && email.value.trim()) validate(false)
}
defineExpose({ validate })
</script>

<template>
  <div class="email-confirmation">
    <label :for="id">Confirma con el correo de tu sesión</label>
    <p :id="id + '-help'">Escribe tu correo electrónico para confirmar esta acción.</p>
    <input
      :id="id"
      ref="input"
      v-model="email"
      type="email"
      inputmode="email"
      autocomplete="off"
      autocapitalize="none"
      :spellcheck="false"
      :disabled="disabled"
      :aria-invalid="!!error"
      :aria-describedby="id + '-help' + (error ? ' ' + id + '-error' : '')"
      @input="error = ''"
      @blur="onBlur"
    />
    <p v-if="error" :id="id + '-error'" class="field-error" aria-live="polite">{{ error }}</p>
  </div>
</template>

<style scoped>
.email-confirmation {
  margin-block: 20px;
}
label {
  display: block;
  font-weight: 600;
}
p {
  margin: 6px 0 10px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--input-background);
  color: var(--text-primary);
}
input:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
input[aria-invalid='true'] {
  border-color: var(--error-color);
}
.field-error {
  color: var(--error-text);
}
</style>
