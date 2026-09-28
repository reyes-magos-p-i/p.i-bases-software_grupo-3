<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId, useTemplateRef, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode?: 'client' | 'employee'
    enabled?: boolean
    submitting?: boolean
    errorMessage?: string
  }>(),
  { mode: 'client', enabled: false, submitting: false, errorMessage: '' },
)
const emit = defineEmits<{
  close: []
  switchMode: [mode: 'client' | 'employee']
  submit: [credentials: { email: string; password: string }]
}>()
const id = useId()
const emailInput = useTemplateRef<HTMLInputElement>('email')
const passwordInput = useTemplateRef<HTMLInputElement>('password')
const feedback = useTemplateRef<HTMLElement>('feedback')
const form = reactive({ email: '', password: '' })
const touched = reactive({ email: false, password: false })
const showPassword = ref(false)
const encoder = new TextEncoder()
const isClient = computed(() => props.mode === 'client')
const emailError = computed(() => {
  const value = form.email.trim().toLowerCase()
  if (!value) return 'Introduce tu correo electrónico.'
  if (encoder.encode(value).length > 150) return 'El correo electrónico es demasiado largo.'
  if (emailInput.value?.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
    return 'Introduce un correo electrónico válido.'
  }
  return ''
})
const passwordError = computed(() => {
  if (!form.password) return 'Introduce tu contraseña.'
  if ([...form.password].length > 128) return 'La contraseña no debe superar 128 caracteres.'
  return ''
})

function clearPassword() {
  form.password = ''
  showPassword.value = false
  touched.email = false
  touched.password = false
}

watch([() => props.open, () => props.mode], async ([open]) => {
  clearPassword()
  form.email = ''
  if (open) {
    await nextTick()
    emailInput.value?.focus()
  }
})
watch(
  () => props.errorMessage,
  async (message) => {
    if (message && props.open) {
      await nextTick()
      feedback.value?.focus()
    }
  },
)

function close() {
  clearPassword()
  emit('close')
}

function switchMode() {
  if (props.submitting) return
  clearPassword()
  emit('switchMode', isClient.value ? 'employee' : 'client')
}

function submit() {
  if (props.submitting || !props.open) return
  touched.email = true
  touched.password = true
  if (emailError.value) {
    emailInput.value?.focus()
    return
  }
  if (passwordError.value) {
    passwordInput.value?.focus()
    return
  }
  if (!props.enabled) return
  emit('submit', { email: form.email.trim().toLowerCase(), password: form.password })
}
</script>

<template>
  <BaseModal
    :open="open"
    :title="isClient ? 'Iniciar sesión' : 'Inicio de sesión del personal'"
    @close="close"
  >
    <div class="login-content">
      <template v-if="isClient">
        <SocialAuthButtons mode="login" disabled />
        <p class="availability-note">Google y Facebook estarán disponibles próximamente.</p>
        <div class="login-divider" aria-hidden="true"></div>
      </template>
      <p v-else class="login-intro">Acceso para empleados y administradores.</p>

      <p class="required-note">
        <span class="required-mark" aria-hidden="true">*</span> Campos obligatorios
      </p>
      <form novalidate :aria-busy="submitting" @submit.prevent="submit">
        <div class="login-field">
          <label :for="`${id}-email`"
            >Correo electrónico <span class="required-mark" aria-hidden="true">*</span></label
          >
          <input
            :id="`${id}-email`"
            ref="email"
            v-model="form.email"
            name="email"
            type="email"
            autocomplete="username"
            autocapitalize="none"
            :spellcheck="false"
            required
            :disabled="submitting"
            :aria-invalid="touched.email && !!emailError"
            :aria-describedby="touched.email && emailError ? `${id}-email-error` : undefined"
            @blur="touched.email = true"
          />
          <p
            v-if="touched.email && emailError"
            :id="`${id}-email-error`"
            class="field-error"
            aria-live="polite"
          >
            {{ emailError }}
          </p>
        </div>
        <div class="login-field">
          <label :for="`${id}-password`"
            >Contraseña <span class="required-mark" aria-hidden="true">*</span></label
          >
          <div class="password-control">
            <input
              :id="`${id}-password`"
              ref="password"
              v-model="form.password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              :disabled="submitting"
              :aria-invalid="touched.password && !!passwordError"
              :aria-describedby="
                touched.password && passwordError ? `${id}-password-error` : undefined
              "
              @blur="touched.password = true"
            />
            <button
              type="button"
              class="password-toggle"
              :disabled="submitting"
              :aria-controls="`${id}-password`"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'" aria-hidden="true"></i>
            </button>
          </div>
          <p
            v-if="touched.password && passwordError"
            :id="`${id}-password-error`"
            class="field-error"
            aria-live="polite"
          >
            {{ passwordError }}
          </p>
        </div>
        <div class="recovery-option">
          <button type="button" class="text-button" disabled>Olvidé mi contraseña</button>
          <span class="availability-note">Próximamente</span>
        </div>
        <p v-if="errorMessage" ref="feedback" class="server-error" tabindex="-1" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="!enabled" :id="`${id}-availability`" class="availability-note" role="status">
          El inicio de sesión estará disponible próximamente.
        </p>
        <button
          type="submit"
          class="login-submit"
          :disabled="!enabled || submitting"
          :aria-describedby="!enabled ? `${id}-availability` : undefined"
        >
          {{ submitting ? 'Iniciando sesión…' : 'Iniciar sesión' }}
        </button>
      </form>
      <button
        type="button"
        class="text-button switch-mode"
        :disabled="submitting"
        @click="switchMode"
      >
        {{
          isClient ? '¿Es un empleado? Haga clic aquí' : 'Volver al inicio de sesión de clientes'
        }}
      </button>
    </div>
  </BaseModal>
</template>

<style scoped>
.login-content {
  color: var(--color-black);
}
.login-intro,
.required-note,
.availability-note {
  color: var(--color-dark);
  font-size: 0.85rem;
}
.login-intro {
  text-align: center;
  margin-bottom: 1.25rem;
}
.required-note {
  margin: 0 0 0.75rem;
}
.required-mark,
.field-error {
  color: #b42318;
}
.availability-note {
  margin: 0.5rem 0;
  line-height: 1.5;
}
.login-divider {
  border-top: 1px solid var(--color-light_gray);
  margin: 1.25rem 0;
}
.login-field {
  margin-bottom: 1rem;
}
label {
  display: block;
  font-weight: 700;
  margin-bottom: 0.4rem;
}
input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--color-gray);
  border-radius: var(--radius-small);
  background: var(--color-light_gray);
  color: var(--color-black);
  padding: 0.6rem 0.75rem;
}
input[aria-invalid='true'] {
  border-color: #b42318;
}
input:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
.field-error {
  font-size: 0.875rem;
  margin: 0.35rem 0 0;
}
.password-control {
  position: relative;
}
.password-control input {
  padding-right: 3.25rem;
}
.password-toggle {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: 44px;
  border: 0;
  background: transparent;
  color: var(--color-dark);
  border-radius: var(--radius-small);
}
.text-button {
  background: none;
  border: 0;
  padding: 0;
  min-height: 44px;
  text-align: left;
  text-decoration: underline;
  color: var(--color-primary);
  font-size: 0.875rem;
}
.recovery-option {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: -0.5rem;
}
.text-button:disabled {
  color: var(--color-dark);
  cursor: not-allowed;
  text-decoration: none;
}
.login-submit {
  width: 100%;
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 0;
  border-radius: var(--radius-small);
  background: var(--color-primary);
  color: var(--color-white);
  font-weight: 600;
}
.login-submit:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.switch-mode {
  display: block;
  margin-top: 0.25rem;
}
.server-error {
  padding: 0.75rem;
  border: 1px solid #b42318;
  border-radius: var(--radius-small);
  color: #b42318;
  overflow-wrap: anywhere;
}
</style>
