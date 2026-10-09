<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'
import type { ClientIdentity } from '@/types/client-auth'
import { validEmail, validText } from '@/utils/user-validation'
import { ChangePasswordError, requestPasswordRecovery } from '@/services/authService'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode?: 'client' | 'employee'
    enabled?: boolean
    submitting?: boolean
    errorMessage?: string
    retryAfterSeconds?: number
  }>(),
  { mode: 'client', enabled: false, submitting: false, errorMessage: '', retryAfterSeconds: 0 },
)
const emit = defineEmits<{
  close: []
  authenticated: [identity: ClientIdentity]
  switchMode: [mode: 'client' | 'employee']
  submit: [credentials: { email: string; password: string }]
}>()
const id = useId()
const emailInput = useTemplateRef<HTMLInputElement>('email')
const passwordInput = useTemplateRef<HTMLInputElement>('password')
const modeSwitch = useTemplateRef<HTMLButtonElement>('modeSwitch')
const feedback = useTemplateRef<HTMLElement>('feedback')
const form = reactive({ email: '', password: '' })
const touched = reactive({ email: false, password: false })
const showPassword = ref(false)
const socialError = ref('')
const socialBusy = ref(false)
const recoveryMode = ref(false)
const recoverySubmitting = ref(false)
const recoveryMessage = ref('')
const recoveryError = ref('')
const recoveryRetrySeconds = ref(0)
let recoveryTimer: ReturnType<typeof setInterval> | undefined
const busy = computed(() => props.submitting || socialBusy.value || recoverySubmitting.value)
const isClient = computed(() => props.mode === 'client')
const emailError = computed(() => {
  const value = form.email.trim().toLowerCase()
  if (!value) return 'Introduce tu correo electrónico.'
  if (!validText(value, 150)) return 'El correo electrónico es demasiado largo.'
  if (emailInput.value?.validity.typeMismatch || !validEmail(value)) {
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
  recoveryMode.value = false
  recoveryMessage.value = ''
  recoveryError.value = ''
  socialError.value = ''
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
  if (busy.value) return
  clearPassword()
  emit('close')
}

function switchMode() {
  if (busy.value) return
  clearPassword()
  emit('switchMode', isClient.value ? 'employee' : 'client')
}

function markTouched(field: 'email' | 'password', event: FocusEvent) {
  if (event.relatedTarget !== modeSwitch.value) touched[field] = true
}

function focusModeSwitch(event: PointerEvent) {
  if (event.button === 0 && !busy.value) modeSwitch.value?.focus()
}

async function submit() {
  if (busy.value || props.retryAfterSeconds > 0 || !props.open) return
  socialError.value = ''
  touched.email = true
  touched.password = true
  if (emailError.value) {
    emailInput.value?.focus()
    return
  }
  if (recoveryMode.value) {
    await submitRecovery()
    return
  }
  if (passwordError.value) {
    passwordInput.value?.focus()
    return
  }
  if (!props.enabled) return
  emit('submit', { email: form.email.trim().toLowerCase(), password: form.password })
}

async function submitRecovery() {
  if (recoveryRetrySeconds.value > 0) return
  recoverySubmitting.value = true
  recoveryMessage.value = ''
  recoveryError.value = ''
  try {
    const result = await requestPasswordRecovery({
      email: form.email.trim().toLowerCase(),
      accountType: props.mode,
    })
    recoveryMessage.value = result.message
  } catch (error) {
    recoveryError.value =
      error instanceof ChangePasswordError
        ? error.message
        : 'No se pudo solicitar la recuperación. Inténtalo nuevamente.'
    if (error instanceof ChangePasswordError && error.retryAfterSeconds) {
      recoveryRetrySeconds.value = error.retryAfterSeconds
      clearInterval(recoveryTimer)
      recoveryTimer = setInterval(() => {
        recoveryRetrySeconds.value--
        if (recoveryRetrySeconds.value <= 0) clearInterval(recoveryTimer)
      }, 1000)
    }
  } finally {
    recoverySubmitting.value = false
  }
}

function toggleRecovery() {
  if (busy.value) return
  clearPassword()
  recoveryMode.value = !recoveryMode.value
  recoveryError.value = ''
  recoveryMessage.value = ''
  void nextTick(() => emailInput.value?.focus())
}
onBeforeUnmount(() => clearInterval(recoveryTimer))
</script>

<template>
  <BaseModal
    :open="open"
    :title="
      recoveryMode
        ? 'Recuperar contraseña'
        : isClient
          ? 'Iniciar sesión'
          : 'Inicio de sesión del personal'
    "
    :close-disabled="busy"
    @close="close"
  >
    <div class="login-content">
      <template v-if="isClient && !recoveryMode">
        <SocialAuthButtons
          mode="login"
          :disabled="!open || submitting || retryAfterSeconds > 0"
          @busy="socialBusy = $event"
          @authenticated="emit('authenticated', $event)"
          @error="socialError = $event"
        />
        <p v-if="socialError" class="server-error" role="alert">{{ socialError }}</p>
        <div class="login-divider" aria-hidden="true"></div>
      </template>
      <p v-else-if="!recoveryMode" class="login-intro">Acceso para empleados y administradores.</p>
      <p v-else class="login-intro">
        Introduce el correo registrado de tu cuenta {{ isClient ? 'de cliente' : 'del personal' }}.
        Recibirás un enlace y una contraseña temporal válidos durante 30 minutos.
      </p>

      <p class="required-note">
        <span class="required-mark" aria-hidden="true">*</span> Campos obligatorios
      </p>
      <form novalidate :aria-busy="busy" @submit.prevent="submit">
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
            :disabled="busy"
            :aria-invalid="touched.email && !!emailError"
            :aria-describedby="touched.email && emailError ? `${id}-email-error` : undefined"
            @blur="markTouched('email', $event)"
          />
          <p
            :id="`${id}-email-error`"
            class="field-error"
            :class="{ 'field-error-hidden': !touched.email || !emailError }"
            :aria-hidden="!touched.email || !emailError"
            aria-live="polite"
          >
            {{ emailError }}
          </p>
        </div>
        <div v-if="!recoveryMode" class="login-field">
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
              :disabled="busy"
              :aria-invalid="touched.password && !!passwordError"
              :aria-describedby="
                touched.password && passwordError ? `${id}-password-error` : undefined
              "
              @blur="markTouched('password', $event)"
            />
            <button
              type="button"
              class="password-toggle"
              :disabled="busy"
              :aria-controls="`${id}-password`"
              :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'" aria-hidden="true"></i>
            </button>
          </div>
          <p
            :id="`${id}-password-error`"
            class="field-error"
            :class="{ 'field-error-hidden': !touched.password || !passwordError }"
            :aria-hidden="!touched.password || !passwordError"
            aria-live="polite"
          >
            {{ passwordError }}
          </p>
        </div>
        <div class="recovery-option">
          <button type="button" class="text-button" :disabled="busy" @click="toggleRecovery">
            {{ recoveryMode ? 'Volver al inicio de sesión' : 'Olvidé mi contraseña' }}
          </button>
        </div>
        <p v-if="recoveryMode && recoveryMessage" class="availability-note" role="status">
          {{ recoveryMessage }}
        </p>
        <p v-if="recoveryMode && recoveryError" class="server-error" role="alert">
          {{ recoveryError }}
        </p>
        <p v-if="recoveryMode && recoveryRetrySeconds > 0" class="availability-note" role="status">
          Puedes volver a intentarlo en {{ recoveryRetrySeconds }} segundos.
        </p>
        <p
          v-if="errorMessage && !recoveryMode"
          ref="feedback"
          class="server-error"
          tabindex="-1"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <p v-if="retryAfterSeconds > 0" class="availability-note" role="status">
          Puedes volver a intentarlo en {{ retryAfterSeconds }} segundos.
        </p>
        <p
          v-if="!enabled && !recoveryMode"
          :id="`${id}-availability`"
          class="availability-note"
          role="status"
        >
          El acceso con correo y contraseña estará disponible próximamente.
        </p>
        <button
          type="submit"
          class="login-submit"
          :disabled="
            (!enabled && !recoveryMode) ||
            busy ||
            retryAfterSeconds > 0 ||
            (recoveryMode && recoveryRetrySeconds > 0)
          "
          :aria-describedby="!enabled && !recoveryMode ? `${id}-availability` : undefined"
        >
          {{
            recoveryMode
              ? recoverySubmitting
                ? 'Enviando…'
                : 'Enviar instrucciones'
              : submitting
                ? 'Iniciando sesión…'
                : 'Iniciar sesión'
          }}
        </button>
      </form>
      <button
        ref="modeSwitch"
        type="button"
        class="text-button switch-mode"
        :disabled="busy"
        @pointerdown="focusModeSwitch"
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
  color: var(--page-background);
}
.login-intro,
.required-note,
.availability-note {
  color: var(--text-primary);
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
  color: var(--error-color);
}
.availability-note {
  margin: 0.5rem 0;
  line-height: 1.5;
}
.login-divider {
  border-top: 1px solid var(--border-color);
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
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--input-background);
  color: var(--page-background);
  padding: 0.6rem 0.75rem;
}
input[aria-invalid='true'] {
  border-color: var(--error-color);
}
input:focus-visible,
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 3px;
}
.field-error {
  font-size: 0.875rem;
  line-height: 1.5;
  min-height: 1.5em;
  margin: 0.35rem 0 0;
}
.field-error-hidden {
  visibility: hidden;
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
  color: var(--text-primary);
  border-radius: var(--radius-small);
}
.text-button {
  background: none;
  border: 0;
  padding: 0;
  min-height: 44px;
  text-align: left;
  text-decoration: underline;
  color: var(--text-primary);
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
  color: var(--text-primary);
  cursor: not-allowed;
  text-decoration: none;
}
.login-submit {
  width: 100%;
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 0;
  border-radius: var(--radius-small);
  background: var(--button-confirm-background);
  color: var(--button-confirm-text);
  font-weight: 600;
}
.login-submit:not(:disabled):hover {
  background: var(--button-confirm-hover-background);
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
  border: 1px solid var(--error-color);
  border-radius: var(--radius-small);
  color: var(--error-color);
  overflow-wrap: anywhere;
}
</style>
