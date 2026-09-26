<script setup lang="ts">
import { reactive, ref } from 'vue'
import { registerUser } from '@/services/authService'
import BaseModal from '@/components/common/BaseModal.vue'
import SocialAuthButtons from '@/components/auth/SocialAuthButtons.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'registered'): void }>()

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
const serverError = ref('')  // For Backend errors that are not field-specific (network issues, server errors).

/**
 * TODO(Raul): Safeguard against common passwords, probably by using a
 *  known list of common passwords or a password strength library.
 */
const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*_-]).{8,}$/

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])

  if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Ingresa un correo válido'
  if (!form.firstName.trim()) errors.firstName = 'Requerido'
  if (!form.lastName.trim()) errors.lastName = 'Requerido'
  if (!form.phone.trim()) errors.phone = 'Requerido'
  if (!form.gender) errors.gender = 'Selecciona una opción'
  if (!form.birthDate) errors.birthDate = 'Requerido'
  if (!PASSWORD_RULE.test(form.password))
    errors.password = 'Mínimo 8 caracteres con mayúscula, minúscula, número y un carácter especial (!@#$%^&*_-).'
  if (form.password === form.email || form.password === form.firstName || form.password === form.lastName)
    errors.password = 'La contraseña no puede ser igual al correo ni al nombre de usuario'
  if (form.password !== form.confirmPassword)
    errors.confirmPassword = 'Las contraseñas no coinciden'
  if (!form.acceptTerms) errors.acceptTerms = 'Debes aceptar los términos'

  return Object.keys(errors).length === 0
}

async function onSubmit() {
  serverError.value = ''
  if (!validate()) return

  loading.value = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword , ...payload } = form
    await registerUser(payload)
    emit('registered')
    emit('close')
  } catch (e) {  // prevent reading from undefined if the error is not an instance of Error
    serverError.value = e instanceof Error ? e.message : 'Error inesperado'
  } finally {  // No matter what happens, we want to stop the loading state. for the next request.
    loading.value = false
  }
}
</script>

<template>
  // Rebase the open prop to the BaseModal
  <BaseModal :open="open" title="Crear cuenta" @close="emit('close')">
    <SocialAuthButtons />

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
          <input id="firstName" v-model="form.firstName" class="form-control"
                 :class="{ 'is-invalid': errors.firstName }" autocomplete="given-name" />
          <div class="invalid-feedback">{{ errors.firstName }}</div>
        </div>
        <div class="col-6">
          <label class="form-label fw-bold" for="lastName">Apellidos</label>
          <input id="lastName" v-model="form.lastName" class="form-control"
                 :class="{ 'is-invalid': errors.lastName }" autocomplete="family-name" />
          <div class="invalid-feedback">{{ errors.lastName }}</div>
        </div>

        <div class="col-6">
          <label class="form-label fw-bold" for="phone">Teléfono</label>
          <input id="phone" v-model="form.phone" type="tel" class="form-control"
                 :class="{ 'is-invalid': errors.phone }" autocomplete="tel" />
          <div class="invalid-feedback">{{ errors.phone }}</div>
        </div>
        <div class="col-6">
          <label class="form-label fw-bold" for="gender">Género</label>
          <select id="gender" v-model="form.gender" class="form-select"
                  :class="{ 'is-invalid': errors.gender }">
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
          <input id="birthDate" v-model="form.birthDate" type="date" class="form-control"
                 :class="{ 'is-invalid': errors.birthDate }" />
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
          <input id="password" v-model="form.password" type="password" class="form-control"
                 :class="{ 'is-invalid': errors.password }" autocomplete="new-password" />
          <div class="invalid-feedback">{{ errors.password }}</div>
          <div class="form-text small">
            Mínimo 8 caracteres. Incluye mayúscula, minúscula, número y un carácter especial (!@#$%^&*_-).
          </div>
        </div>
        <div class="col-12">
          <label class="form-label fw-bold" for="confirmPassword">Repetir contraseña</label>
          <input id="confirmPassword" v-model="form.confirmPassword" type="password"
                 class="form-control" :class="{ 'is-invalid': errors.confirmPassword }"
                 autocomplete="new-password" />
          <div class="invalid-feedback">{{ errors.confirmPassword }}</div>
        </div>

        <div class="col-12">
          <div class="form-check d-flex justify-content-center gap-2">
            <input id="terms" v-model="form.acceptTerms" type="checkbox" class="form-check-input"
                   :class="{ 'is-invalid': errors.acceptTerms }" />
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
  </BaseModal>
</template>

<style scoped>
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