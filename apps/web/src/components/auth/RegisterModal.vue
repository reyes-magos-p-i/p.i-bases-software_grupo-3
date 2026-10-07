<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { validText, validEmail } from '@/utils/user-validation'
import { EmailDeliveryError, registerUser, resendEmailVerification } from '@/services/authService'
import BaseModal from '@/components/common/BaseModal.vue'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'
import type { ClientIdentity } from '@/types/client-auth'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'authenticated', identity: ClientIdentity): void
}>()

const form = reactive({
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  gender: '',
  birthDate: '',
  language: 'es',
  password: '',
  confirmPassword: '',
  acceptTerms: false,
})

// To store validation errors for each field, we use a reactive object with string values.
// If a field has no error, its value will be an empty string and the template will not display an error.
const errors = reactive<Record<string, string>>({})
const loading = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const resendLoading = ref(false)
const serverError = ref('') // For Backend errors that are not field-specific (network issues, server errors).
const verificationEmail = ref('')
const verificationState = ref<'idle' | 'sent' | 'delivery-failed'>('idle')

watch(
  () => props.open,
  (open) => {
    if (!open) {
      verificationState.value = 'idle'
      verificationEmail.value = ''
      serverError.value = ''
      showPassword.value = false
      showConfirmPassword.value = false
    }
  },
)

/**
 * TODO(Raul): Safeguard against common passwords, probably by using a
 *  known list of common passwords or a password strength library.
 */
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_-]).{8,}$/

function normalizeCostaRicaPhone(phone: string): string {
  return phone.trim().replace(/[-\s]/gu, '')
}

function isAdult(birthDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(birthDate)
  if (!match) return false
  const [, yearText, monthText, dayText] = match
  const birthYear = Number(yearText)
  const birthMonth = Number(monthText)
  const birthDay = Number(dayText)
  const parsedDate = new Date(Date.UTC(birthYear, birthMonth - 1, birthDay))
  if (
    parsedDate.getUTCFullYear() !== birthYear ||
    parsedDate.getUTCMonth() + 1 !== birthMonth ||
    parsedDate.getUTCDate() !== birthDay
  )
    return false

  const todayParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts()
  const today = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]))
  const todayYear = Number(today.year)
  const todayMonth = Number(today.month)
  const todayDay = Number(today.day)

  return (
    birthYear < todayYear - 18 ||
    (birthYear === todayYear - 18 &&
      (birthMonth < todayMonth || (birthMonth === todayMonth && birthDay <= todayDay)))
  )
}

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])

  if (!validEmail(form.email)) errors.email = 'Ingresa un correo válido'
  if (!form.firstName.trim()) errors.firstName = 'Requerido'
  if (!form.lastName.trim()) errors.lastName = 'Requerido'
  if (!form.phone.trim()) {
    errors.phone = 'Requerido'
  } else if (!/^\d{4}[-\s]?\d{4}$/u.test(form.phone.trim())) {
    errors.phone = 'Ingresa un teléfono costarricense válido de 8 dígitos'
  }
  for (const field of ['firstName', 'lastName'] as const) {
    if (form[field].trim() && !validText(form[field].trim(), 100))
      errors[field] = 'Ingresa texto válido de hasta 100 bytes en UTF-8.'
  }
  if (!form.gender) errors.gender = 'Selecciona una opción'
  if (!form.birthDate) {
    errors.birthDate = 'Requerido'
  } else if (!isAdult(form.birthDate)) {
    errors.birthDate = 'Debes tener al menos 18 años para registrarte'
  }
  if (!PASSWORD_RULE.test(form.password))
    errors.password =
      'Mínimo 8 caracteres con mayúscula, minúscula, número y un carácter especial (!@#$%^&*_-).'
  if (
    form.password === form.email ||
    form.password === form.firstName ||
    form.password === form.lastName
  )
    errors.password = 'La contraseña no puede ser igual al correo ni al nombre de usuario'
  if (form.password !== form.confirmPassword)
    errors.confirmPassword = 'Las contraseñas no coinciden'
  if (!form.acceptTerms) errors.acceptTerms = 'Debes aceptar los términos'

  return Object.keys(errors).length === 0
}

function handleAuthenticated(identity: ClientIdentity) {
  serverError.value = ''
  emit('authenticated', identity)
  emit('close')
}

function handleSocialAuthError(message: string) {
  serverError.value = message
}

async function onSubmit() {
  serverError.value = ''
  if (!validate()) return

  loading.value = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword: _confirmPassword, ...payload } = form
    await registerUser({
      ...payload,
      email: form.email.trim().toLowerCase(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: normalizeCostaRicaPhone(payload.phone),
    })
    verificationEmail.value = payload.email.trim().toLowerCase()
    verificationState.value = 'sent'
  } catch (e) {
    // prevent reading from undefined if the error is not an instance of Error
    if (e instanceof EmailDeliveryError) {
      verificationEmail.value = form.email.trim().toLowerCase()
      verificationState.value = 'delivery-failed'
      serverError.value = e.message
    } else {
      serverError.value = e instanceof Error ? e.message : 'Error inesperado'
    }
  } finally {
    // No matter what happens, we want to stop the loading state. for the next request.
    loading.value = false
  }
}

async function resendVerificationEmail() {
  if (!verificationEmail.value || resendLoading.value) return
  resendLoading.value = true
  serverError.value = ''
  try {
    await resendEmailVerification(verificationEmail.value)
    verificationState.value = 'sent'
  } catch (error) {
    serverError.value =
      error instanceof Error ? error.message : 'No se pudo reenviar el correo de confirmación.'
  } finally {
    resendLoading.value = false
  }
}
</script>

<template>
  <BaseModal :open="open" title="Crear cuenta" @close="emit('close')">
    <template v-if="verificationState === 'idle'">
      <SocialAuthButtons @authenticated="handleAuthenticated" @error="handleSocialAuthError" />

      <hr class="my-3" />

      <form novalidate @submit.prevent="onSubmit">
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label fw-bold" for="email">Correo Electrónico</label>
            <!-- Model binding -->
            <input
              id="email"
              v-model="form.email"
              type="email"
              class="form-control"
              :class="{ 'is-invalid': errors.email }"
              autocomplete="email"
            />
            <div class="invalid-feedback">{{ errors.email }}</div>
          </div>

          <div class="col-6">
            <label class="form-label fw-bold" for="firstName">Nombre</label>
            <input
              id="firstName"
              v-model="form.firstName"
              class="form-control"
              :class="{ 'is-invalid': errors.firstName }"
              autocomplete="given-name"
            />
            <div class="invalid-feedback">{{ errors.firstName }}</div>
          </div>
          <div class="col-6">
            <label class="form-label fw-bold" for="lastName">Apellidos</label>
            <input
              id="lastName"
              v-model="form.lastName"
              class="form-control"
              :class="{ 'is-invalid': errors.lastName }"
              autocomplete="family-name"
            />
            <div class="invalid-feedback">{{ errors.lastName }}</div>
          </div>

          <div class="col-6">
            <label class="form-label fw-bold" for="phone">Teléfono</label>
            <input
              id="phone"
              v-model="form.phone"
              type="tel"
              class="form-control"
              :class="{ 'is-invalid': errors.phone }"
              autocomplete="tel"
              inputmode="numeric"
              maxlength="9"
              placeholder="8888-1234"
            />
            <div class="invalid-feedback">{{ errors.phone }}</div>
            <div class="form-text small">Ingresa 8 dígitos, por ejemplo 8888-1234.</div>
          </div>
          <div class="col-6">
            <label class="form-label fw-bold" for="gender">Género</label>
            <select
              id="gender"
              v-model="form.gender"
              class="form-select"
              :class="{ 'is-invalid': errors.gender }"
            >
              <option value="" disabled>Seleccionar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="O">Otro</option>
              <option value="N">Prefiero no decir</option>
            </select>
            <div class="invalid-feedback">{{ errors.gender }}</div>
          </div>

          <div class="col-6">
            <label class="form-label fw-bold" for="birthDate">Fecha de nacimiento</label>
            <input
              id="birthDate"
              v-model="form.birthDate"
              type="date"
              class="form-control"
              :class="{ 'is-invalid': errors.birthDate }"
            />
            <div class="invalid-feedback">{{ errors.birthDate }}</div>
          </div>
          <div class="col-6">
            <label class="form-label fw-bold" for="language">Idioma</label>
            <select id="language" v-model="form.language" class="form-select">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>

          <div class="col-12">
            <label class="form-label fw-bold" for="password">Contraseña</label>
            <div class="password-control">
              <input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="form-control"
                :class="{ 'is-invalid': errors.password }"
                autocomplete="new-password"
                :aria-describedby="errors.password ? 'password-error' : undefined"
              />
              <button
                type="button"
                class="password-toggle"
                :aria-controls="'password'"
                :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'" aria-hidden="true"></i>
              </button>
              <div id="password-error" class="invalid-feedback">{{ errors.password }}</div>
            </div>
            <div class="form-text small">
              Mínimo 8 caracteres. Incluye mayúscula, minúscula, número y un carácter especial
              (!@#$%^&*_-).
            </div>
          </div>
          <div class="col-12">
            <label class="form-label fw-bold" for="confirmPassword">Repetir contraseña</label>
            <div class="password-control">
              <input
                id="confirmPassword"
                v-model="form.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                class="form-control"
                :class="{ 'is-invalid': errors.confirmPassword }"
                autocomplete="new-password"
                :aria-describedby="errors.confirmPassword ? 'confirm-password-error' : undefined"
              />
              <button
                type="button"
                class="password-toggle"
                :aria-controls="'confirmPassword'"
                :aria-label="
                  showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                "
                :aria-pressed="showConfirmPassword"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <i
                  :class="showConfirmPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"
                  aria-hidden="true"
                ></i>
              </button>
              <div id="confirm-password-error" class="invalid-feedback">
                {{ errors.confirmPassword }}
              </div>
            </div>
          </div>

          <div class="col-12">
            <div class="form-check d-flex justify-content-center gap-2">
              <input
                id="terms"
                v-model="form.acceptTerms"
                type="checkbox"
                class="form-check-input"
                :class="{ 'is-invalid': errors.acceptTerms }"
              />
              <label class="form-check-label" for="terms">
                Acepto <a href="#" class="fw-bold text-dark">Términos y Condiciones.</a>
              </label>
            </div>
            <div v-if="errors.acceptTerms" class="text-danger small text-center">
              {{ errors.acceptTerms }}
            </div>
          </div>
        </div>

        <div v-if="serverError" class="alert alert-danger mt-3 mb-0">{{ serverError }}</div>

        <div class="text-center mt-3">
          <button type="submit" class="btn-brand" :disabled="loading">
            {{ loading ? 'Creando...' : 'Crear cuenta' }}
          </button>
        </div>
      </form>
    </template>

    <section v-else class="verification-feedback" aria-live="polite">
      <p v-if="verificationState === 'sent'" class="alert alert-success">
        Te enviamos un enlace de confirmación a <strong>{{ verificationEmail }}</strong
        >. Confirma tu correo para activar tu cuenta e iniciar sesión.
      </p>
      <p v-else class="alert alert-danger" role="alert">{{ serverError }}</p>
      <p v-if="verificationState === 'delivery-failed'" class="small">
        La cuenta quedó pendiente. Puedes volver a solicitar el correo.
      </p>
      <p v-if="serverError && verificationState === 'sent'" class="alert alert-danger" role="alert">
        {{ serverError }}
      </p>
      <button
        type="button"
        class="btn-brand"
        :disabled="resendLoading"
        @click="resendVerificationEmail"
      >
        {{ resendLoading ? 'Enviando…' : 'Reenviar correo' }}
      </button>
    </section>
  </BaseModal>
</template>

<style scoped>
.password-control {
  position: relative;
}
.password-control .form-control {
  padding-right: 2.75rem;
}
.password-toggle {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  width: 2.75rem;
  height: 100%;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--color-dark);
}
.password-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -3px;
}
.btn-brand {
  background: var(--color-brand, #3d0a0a);
  color: #fff;
  border: 0;
  border-radius: 6px;
  padding: 0.6rem 3rem;
}
.btn-brand:disabled {
  opacity: 0.6;
}
</style>
