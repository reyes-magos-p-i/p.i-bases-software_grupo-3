<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useBlurValidation } from '@/composables/useBlurValidation'
import { validEmail } from '@/utils/user-validation'
import type { GuestBuyer } from '@/types/purchase'
const props = defineProps<{
  buyer: GuestBuyer | null
  disabled: boolean
  error: string
  loginRequired: boolean
}>()
const emit = defineEmits<{ continue: [buyer: GuestBuyer]; back: []; login: [] }>()
const email = ref(props.buyer?.email ?? ''),
  confirmEmail = ref(props.buyer?.confirmEmail ?? '')
const touched = reactive({ email: false, confirmEmail: false })
const shouldValidate = useBlurValidation()
function emailError() {
  if (!email.value.trim()) return 'Introduce tu correo electrónico.'
  return validEmail(email.value) ? '' : 'Introduce un correo electrónico válido.'
}
function confirmationError() {
  if (!confirmEmail.value.trim()) return 'Confirma tu correo electrónico.'
  return confirmEmail.value.trim().toLowerCase() === email.value.trim().toLowerCase()
    ? ''
    : 'Los correos electrónicos deben coincidir.'
}
function blur(field: keyof typeof touched, event: FocusEvent) {
  if (shouldValidate(event)) touched[field] = true
}
function submit() {
  if (props.disabled) return
  touched.email = true
  touched.confirmEmail = true
  if (emailError() || confirmationError()) return
  emit('continue', {
    email: email.value.trim().toLowerCase(),
    confirmEmail: confirmEmail.value.trim().toLowerCase(),
  })
}
</script>
<template>
  <section class="guest-buyer">
    <h1>¿A qué correo asociamos tu compra?</h1>
    <p>Compra sin crear una cuenta. Confirma tu correo antes de continuar.</p>
    <form novalidate @submit.prevent="submit">
      <label for="guest-email">Correo electrónico</label>
      <input
        id="guest-email"
        v-model="email"
        type="email"
        autocomplete="email"
        :disabled="disabled"
        :aria-invalid="touched.email && !!emailError()"
        :aria-describedby="touched.email && emailError() ? 'guest-email-error' : undefined"
        @blur="blur('email', $event)"
      />
      <p v-if="touched.email && emailError()" id="guest-email-error" class="field-error">
        {{ emailError() }}
      </p>
      <label for="guest-confirm-email">Confirmar correo electrónico</label>
      <input
        id="guest-confirm-email"
        v-model="confirmEmail"
        type="email"
        autocomplete="email"
        :disabled="disabled"
        :aria-invalid="touched.confirmEmail && !!confirmationError()"
        :aria-describedby="
          touched.confirmEmail && confirmationError() ? 'guest-confirm-email-error' : undefined
        "
        @blur="blur('confirmEmail', $event)"
      />
      <p
        v-if="touched.confirmEmail && confirmationError()"
        id="guest-confirm-email-error"
        class="field-error"
      >
        {{ confirmationError() }}
      </p>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <button
        v-if="loginRequired"
        type="button"
        class="purchase-action primary"
        :disabled="disabled"
        @click="emit('login')"
      >
        Iniciar sesión
      </button>
      <div class="buyer-actions">
        <button type="button" class="purchase-action" :disabled="disabled" @click="emit('back')">
          Volver a los asientos
        </button>
        <button type="submit" class="purchase-action primary" :disabled="disabled">
          {{ disabled ? 'Comprobando correo...' : 'Continuar al resumen' }}
        </button>
      </div>
    </form>
  </section>
</template>
<style scoped>
.guest-buyer {
  max-width: 680px;
  margin: auto;
}
form {
  display: grid;
  gap: 10px;
}
label {
  margin-top: 14px;
  font-weight: 600;
}
input {
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border-radius: var(--radius-small);
  border: 1px solid var(--border-color);
  background: var(--content-background);
  color: var(--text-primary);
  font: inherit;
}
input:focus-visible {
  outline: 3px solid var(--primary-color);
  outline-offset: 2px;
}
.field-error {
  color: var(--error-text);
  background: var(--error-background);
  padding: 10px;
  border-radius: var(--radius-small);
  margin: 0;
}
.buyer-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 14px;
  margin-top: 24px;
}
</style>
