<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import {
  ChangePasswordError,
  changeEmployeePassword,
  changeClientPassword,
  type ChangeEmployeePasswordPayload,
  getClientPasswordStatus,
  getEmployeePasswordStatus,
  type ChangeClientPasswordPayload,
  type ClientPasswordStatus,
  validatePasswordRecovery,
  resetPassword,
} from '@/services/authService'
import { clientSession } from '@/services/client-session.service'
import { employeeSession } from '@/services/employee-session.service'
import type { EmployeeIdentity } from '@/types/employee-auth'
import { checkPasswordPolicy, isPasswordPolicySatisfied } from '@/utils/password-policy'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
    accountType?: 'client' | 'employee'
    recovery?: boolean
    recoveryToken?: string
  }>(),
  { embedded: false, accountType: 'client', recovery: false, recoveryToken: '' },
)
const emit = defineEmits<{
  'return-to-dashboard': []
  'submission-state': [loading: boolean]
}>()
const router = useRouter()
const user = computed(() =>
  props.accountType === 'employee'
    ? (employeeSession.user.value as EmployeeIdentity | null)
    : clientSession.user.value,
)

const EXPIRATION_OPTIONS = [30, 60, 90, 120] as const

const status = ref<ClientPasswordStatus>('valid')
const statusLoading = ref(true)
const statusError = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)

const isMustSet = computed(() => status.value === 'must_set')
const isForced = computed(() => status.value !== 'valid')

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
  expirationDays: 90 as 30 | 60 | 90 | 120,
})
const errors = reactive<{ currentPassword?: string; confirm?: string; form?: string }>({})
const violationCodes = ref<string[]>([])
const loading = ref(false)
const success = ref(false)
const recoveryAccountType = ref<'client' | 'employee'>('client')
const recoveryExpiresAt = ref('')
const recoveryExpired = ref(false)
const retrySeconds = ref(0)
let retryTimer: ReturnType<typeof setInterval> | undefined

const policyChecks = computed(() =>
  checkPasswordPolicy(form.newPassword, {
    email: props.recovery ? undefined : user.value?.email,
    firstName: props.recovery ? undefined : user.value?.firstName,
  }),
)
const policySatisfied = computed(() => isPasswordPolicySatisfied(policyChecks.value))
const isEmployee = computed(
  () => (props.recovery ? recoveryAccountType.value : props.accountType) === 'employee',
)

async function loadStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    if (props.recovery) {
      if (!/^[a-f0-9]{64}$/u.test(props.recoveryToken)) {
        throw new ChangePasswordError(
          'El enlace no es válido. Solicita una nueva recuperación.',
          'RECOVERY_INVALID',
        )
      }
      const result = await validatePasswordRecovery(props.recoveryToken)
      recoveryAccountType.value = result.accountType
      recoveryExpiresAt.value = new Date(result.expiresAt).toLocaleTimeString('es-CR', {
        hour: '2-digit',
        minute: '2-digit',
      })
      return
    }
    status.value = isEmployee.value
      ? await getEmployeePasswordStatus()
      : await getClientPasswordStatus()
  } catch (error) {
    recoveryExpired.value =
      error instanceof ChangePasswordError && error.code === 'RECOVERY_INVALID'
    statusError.value =
      props.recovery && error instanceof ChangePasswordError
        ? error.message
        : 'No se pudo comprobar el estado de tu contraseña. Intenta de nuevo.'
  } finally {
    statusLoading.value = false
  }
}

onMounted(loadStatus)
onBeforeUnmount(() => clearInterval(retryTimer))

async function submit() {
  if (loading.value || retrySeconds.value > 0) return
  errors.currentPassword = undefined
  errors.confirm = undefined
  errors.form = undefined
  violationCodes.value = []

  if (!isMustSet.value && !form.currentPassword) {
    errors.currentPassword = props.recovery
      ? 'Ingresa la contraseña temporal del correo'
      : 'Ingresa tu contraseña actual'
    return
  }
  if (form.newPassword !== form.confirmNewPassword) {
    errors.confirm = 'Las contraseñas no coinciden'
    return
  }
  if (!policySatisfied.value) {
    errors.form = 'La contraseña no cumple con la política de seguridad'
    return
  }

  loading.value = true
  emit('submission-state', true)
  try {
    const payload: ChangeClientPasswordPayload = {
      newPassword: form.newPassword,
      confirmNewPassword: form.confirmNewPassword,
      expirationDays: form.expirationDays,
    }
    if (!isMustSet.value) payload.currentPassword = form.currentPassword
    if (props.recovery) {
      await resetPassword({
        token: props.recoveryToken,
        temporaryPassword: form.currentPassword,
        newPassword: form.newPassword,
        confirmNewPassword: form.confirmNewPassword,
        expirationDays: form.expirationDays,
      })
      form.currentPassword = ''
      form.newPassword = ''
      form.confirmNewPassword = ''
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      )
    } else if (isEmployee.value) {
      const employeePayload: ChangeEmployeePasswordPayload = {
        ...payload,
        currentPassword: form.currentPassword,
      }
      await changeEmployeePassword(employeePayload)
    } else await changeClientPassword(payload)
    success.value = true
    status.value = 'valid'
  } catch (error) {
    handleSubmissionError(error)
  } finally {
    loading.value = false
    emit('submission-state', false)
  }
}

function handleSubmissionError(error: unknown) {
  if (!(error instanceof ChangePasswordError)) {
    errors.form = isEmployee.value
      ? 'No se pudo actualizar la contraseña, intenta de nuevo'
      : 'No se pudo actualizar la contraseña, intenta de nuevo.'
    return
  }
  switch (error.code) {
    case 'RECOVERY_INVALID':
      recoveryExpired.value = true
      statusError.value = error.message
      break
    case 'TEMPORARY_PASSWORD_INCORRECT':
      errors.currentPassword = error.message
      break
    case 'CURRENT_PASSWORD_INCORRECT':
      errors.currentPassword = isEmployee.value ? 'Contraseña actual incorrecta' : error.message
      break
    case 'PASSWORDS_DO_NOT_MATCH':
      errors.confirm = isEmployee.value ? 'Las contraseñas no coinciden' : error.message
      break
    case 'NEW_PASSWORD_SAME_AS_CURRENT':
      errors.form = isEmployee.value
        ? 'La nueva contraseña no puede ser igual a la actual'
        : error.message
      break
    case 'PASSWORD_POLICY_VIOLATION':
      errors.form = isEmployee.value
        ? 'La contraseña no cumple con la política de seguridad'
        : error.message
      violationCodes.value = error.violations ?? []
      break
    default:
      errors.form = isEmployee.value ? error.message.replace(/\.$/u, '') : error.message
  }
  if (error.retryAfterSeconds) startRetryDelay(error.retryAfterSeconds)
}

function startRetryDelay(seconds: number) {
  retrySeconds.value = seconds
  clearInterval(retryTimer)
  retryTimer = setInterval(() => {
    retrySeconds.value--
    if (retrySeconds.value <= 0) clearInterval(retryTimer)
  }, 1000)
}

function goHome() {
  if (props.recovery) {
    void router.push({ path: '/', query: { login: recoveryAccountType.value } })
    return
  }
  if (isEmployee.value && props.embedded) {
    emit('return-to-dashboard')
    return
  }
  void router.push(isEmployee.value ? '/dashboard' : '/')
}
</script>

<template>
  <AppHeader v-if="!props.embedded" />

  <main class="change-password-page" :class="{ 'is-embedded': props.embedded }">
    <div class="change-password-container">
      <header class="page-heading">
        <p class="page-eyebrow">SEGURIDAD DE LA CUENTA</p>
        <h1>
          {{
            props.recovery
              ? 'Recuperar contraseña'
              : isMustSet
                ? 'Configura tu contraseña'
                : 'Cambiar contraseña'
          }}
        </h1>
        <p class="page-description">
          Actualiza tu contraseña para mantener tu cuenta de Cinetadel segura.
        </p>
      </header>

      <p v-if="statusLoading" class="page-status" role="status">
        <span class="loading-spinner" aria-hidden="true"></span>
        Comprobando el estado de tu contraseña…
      </p>

      <div v-else class="password-layout">
        <section class="form-card" aria-labelledby="password-form-title">
          <template v-if="statusError">
            <div class="status-message status-error" role="alert">
              <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
              <p>{{ statusError }}</p>
            </div>
            <button
              v-if="!recoveryExpired"
              type="button"
              class="primary-button"
              @click="loadStatus"
            >
              Reintentar
            </button>
            <button v-if="props.recovery" type="button" class="secondary-button" @click="goHome">
              Volver al inicio de sesión
            </button>
          </template>

          <template v-else-if="success">
            <div class="success-state" role="status">
              <span class="success-icon"><i class="bi bi-check-lg" aria-hidden="true"></i></span>
              <h2 id="password-form-title">Contraseña actualizada</h2>
              <p>
                {{
                  isEmployee
                    ? 'Contraseña actualizada correctamente'
                    : 'Tu contraseña se actualizó correctamente.'
                }}
              </p>
              <button type="button" class="primary-button continue-button" @click="goHome">
                {{
                  props.recovery ? 'Iniciar sesión' : isEmployee ? 'Volver al tablero' : 'Continuar'
                }}
              </button>
            </div>
          </template>

          <template v-else>
            <h2 id="password-form-title">
              {{ isMustSet ? 'Crear contraseña' : 'Cambiar contraseña' }}
            </h2>
            <p v-if="props.recovery" class="status-message" role="status">
              Introduce la contraseña temporal que recibiste por correo. El enlace vence a las
              {{ recoveryExpiresAt }} (hora de tu dispositivo) y solo puede usarse una vez.
            </p>

            <p v-if="status === 'expired'" class="status-message status-expired" role="alert">
              <i class="bi bi-clock-history" aria-hidden="true"></i>
              Tu contraseña venció. Define una nueva para continuar.
            </p>
            <p v-else-if="isMustSet" class="status-message status-must-set" role="status">
              <i class="bi bi-info-circle" aria-hidden="true"></i>
              Configura una contraseña local para tu cuenta.
            </p>

            <form class="password-form" :aria-busy="loading" @submit.prevent="submit">
              <div v-if="!isMustSet" class="form-field">
                <label for="currentPassword">{{
                  props.recovery ? 'Contraseña temporal' : 'Contraseña actual'
                }}</label>
                <div class="password-control">
                  <input
                    id="currentPassword"
                    v-model="form.currentPassword"
                    :type="showCurrentPassword ? 'text' : 'password'"
                    :autocomplete="props.recovery ? 'one-time-code' : 'current-password'"
                    :disabled="loading"
                    :aria-invalid="!!errors.currentPassword"
                    :aria-describedby="
                      errors.currentPassword ? 'current-password-error' : undefined
                    "
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    :aria-controls="'currentPassword'"
                    :aria-label="showCurrentPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                    :aria-pressed="showCurrentPassword"
                    @click="showCurrentPassword = !showCurrentPassword"
                  >
                    <i
                      :class="showCurrentPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"
                      aria-hidden="true"
                    ></i>
                  </button>
                </div>
                <p
                  v-if="errors.currentPassword"
                  id="current-password-error"
                  class="field-error"
                  role="alert"
                >
                  {{ errors.currentPassword }}
                </p>
              </div>

              <div class="form-field">
                <label for="newPassword">Nueva contraseña</label>
                <div class="password-control">
                  <input
                    id="newPassword"
                    v-model="form.newPassword"
                    :type="showNewPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    :disabled="loading"
                    aria-describedby="password-policy-title"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    :aria-controls="'newPassword'"
                    :aria-label="showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                    :aria-pressed="showNewPassword"
                    @click="showNewPassword = !showNewPassword"
                  >
                    <i
                      :class="showNewPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"
                      aria-hidden="true"
                    ></i>
                  </button>
                </div>
              </div>

              <div class="form-field">
                <label for="confirmNewPassword">Confirmar nueva contraseña</label>
                <div class="password-control">
                  <input
                    id="confirmNewPassword"
                    v-model="form.confirmNewPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    autocomplete="new-password"
                    :disabled="loading"
                    :aria-invalid="!!errors.confirm"
                    :aria-describedby="errors.confirm ? 'confirm-password-error' : undefined"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    :aria-controls="'confirmNewPassword'"
                    :aria-label="showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                    :aria-pressed="showConfirmPassword"
                    @click="showConfirmPassword = !showConfirmPassword"
                  >
                    <i
                      :class="showConfirmPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"
                      aria-hidden="true"
                    ></i>
                  </button>
                </div>
                <p
                  v-if="errors.confirm"
                  id="confirm-password-error"
                  class="field-error"
                  role="alert"
                >
                  {{ errors.confirm }}
                </p>
              </div>

              <div class="form-field">
                <label for="expirationDays">Vigencia de la contraseña</label>
                <select
                  id="expirationDays"
                  v-model.number="form.expirationDays"
                  :disabled="loading"
                >
                  <option v-for="days in EXPIRATION_OPTIONS" :key="days" :value="days">
                    {{ days }} días
                  </option>
                </select>
              </div>

              <p v-if="errors.form" class="field-error form-error" role="alert">
                {{ errors.form }}
              </p>

              <div class="form-actions">
                <p v-if="retrySeconds > 0" role="status">
                  Puedes volver a intentarlo en {{ retrySeconds }} segundos.
                </p>
                <button
                  type="submit"
                  class="primary-button"
                  :disabled="loading || retrySeconds > 0"
                >
                  <i class="bi bi-shield-lock" aria-hidden="true"></i>
                  {{ loading ? 'Guardando…' : 'Guardar contraseña' }}
                </button>
                <button
                  v-if="!isForced"
                  type="button"
                  class="secondary-button"
                  :disabled="loading"
                  @click="goHome"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </template>
        </section>

        <aside class="policy-card" aria-labelledby="password-policy-title">
          <div class="policy-heading">
            <span class="policy-icon"
              ><i class="bi bi-shield-lock-fill" aria-hidden="true"></i
            ></span>
            <div>
              <p class="policy-eyebrow">PROTEGE TU CUENTA</p>
              <h2 id="password-policy-title">Contraseña segura</h2>
            </div>
          </div>

          <p class="policy-intro">Tu contraseña debe cumplir con estos requisitos:</p>
          <ul class="policy-checklist">
            <li
              v-for="check in policyChecks"
              :key="check.code"
              :class="{
                satisfied: check.satisfied,
                violated: violationCodes.includes(check.code),
              }"
            >
              <i
                :class="check.satisfied ? 'bi bi-check-circle-fill' : 'bi bi-circle'"
                aria-hidden="true"
              ></i>
              <span>{{ check.label }}</span>
            </li>
          </ul>

          <div class="policy-note">
            <i class="bi bi-info-circle" aria-hidden="true"></i>
            <p>
              Una buena contraseña es como tu entrada al cine: solo tú deberías tenerla. No la
              compartas con nadie.
            </p>
          </div>
        </aside>
      </div>
    </div>
  </main>

  <AppFooter v-if="!props.embedded" />
</template>

<style scoped>
.change-password-page {
  min-height: 560px;
  padding: clamp(36px, 6vw, 72px) 16px clamp(48px, 7vw, 88px);
  font-family: inherit;
  background:
    radial-gradient(ellipse at 78% 18%, rgb(54 8 12 / 5%), transparent 38%), var(--color-background);
}

.change-password-page.is-embedded {
  min-height: 0;
  padding: 0;
  background: transparent;
}

.change-password-container {
  width: min(100%, 1040px);
  margin-inline: auto;
}

.page-heading {
  margin-bottom: 30px;
  text-align: center;
}

.is-embedded .page-heading {
  margin-bottom: 20px;
  text-align: left;
}

.page-eyebrow,
.policy-eyebrow {
  margin: 0 0 8px;
  color: var(--color-primary);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.page-heading h1 {
  margin: 0;
  color: var(--color-black);
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  font-weight: 750;
}

.page-description {
  margin: 10px 0 0;
  color: #626262;
}

.password-layout {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
  align-items: stretch;
  gap: clamp(20px, 4vw, 40px);
}

.is-embedded .password-layout {
  gap: clamp(16px, 2.5vw, 28px);
}

.form-card,
.policy-card {
  border: 1px solid #e4e1e1;
  border-radius: var(--radius-medium);
  background: var(--color-white);
  box-shadow: 0 8px 28px rgb(13 13 13 / 8%);
}

.is-embedded .form-card,
.is-embedded .policy-card {
  box-shadow: 0 2px 10px rgb(13 13 13 / 5%);
}

.form-card {
  padding: clamp(22px, 3.5vw, 36px);
}

.form-card h2 {
  margin: 0 0 24px;
  color: var(--color-black);
  font-size: 1.35rem;
  font-weight: 700;
}

.password-form {
  display: grid;
  gap: 20px;
}

.form-field label {
  display: block;
  margin-bottom: 7px;
  color: #333;
  font-size: 0.92rem;
  font-weight: 650;
}

.form-field input,
.form-field select {
  width: 100%;
  min-height: 46px;
  padding: 10px 13px;
  border: 1px solid #cfcaca;
  border-radius: var(--radius-small);
  background-color: #fff;
  color: var(--color-black);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.form-field input:focus,
.form-field select:focus {
  border-color: var(--color-primary);
  outline: 0;
  box-shadow: 0 0 0 3px rgb(54 8 12 / 12%);
}

.form-field input[aria-invalid='true'] {
  border-color: var(--color-error);
}

.password-control {
  position: relative;
}

.password-control input {
  padding-right: 48px;
}

.password-toggle {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  width: 46px;
  height: 100%;
  place-items: center;
  border: 0;
  border-radius: var(--radius-small);
  background: transparent;
  color: #5e5a5a;
  cursor: pointer;
}

.password-toggle:hover {
  color: var(--color-primary);
}

.password-toggle:focus-visible,
.primary-button:focus-visible,
.secondary-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}

.field-error {
  margin: 6px 0 0;
  color: var(--color-error);
  font-size: 0.85rem;
  line-height: 1.45;
}

.form-error {
  margin-top: -8px;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.primary-button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 11px 20px;
  border: 0;
  border-radius: var(--radius-small);
  background: var(--color-primary);
  color: var(--color-white);
  font-weight: 700;
  transition:
    background-color var(--transition-fast),
    transform var(--transition-fast);
  cursor: pointer;
}

.primary-button:hover:not(:disabled) {
  background: #521117;
  transform: translateY(-1px);
}

.primary-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.secondary-button {
  min-height: 44px;
  padding: 8px 13px;
  border: 1px solid #d7d2d2;
  border-radius: var(--radius-small);
  background: #fff;
  color: #4b4545;
  cursor: pointer;
}

.secondary-button:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.policy-card {
  display: flex;
  flex-direction: column;
  padding: clamp(24px, 4vw, 40px);
  border-color: #e0d8d8;
  background: linear-gradient(145deg, rgb(54 8 12 / 3%), transparent 55%), var(--color-white);
}

.policy-heading {
  display: flex;
  align-items: center;
  gap: 15px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e9e5e5;
}

.policy-icon {
  display: grid;
  width: 50px;
  height: 50px;
  flex: 0 0 50px;
  place-items: center;
  border-radius: 50%;
  background: rgb(54 8 12 / 8%);
  color: var(--color-primary);
  font-size: 1.35rem;
}

.policy-eyebrow {
  margin-bottom: 3px;
  font-size: 0.68rem;
}

.policy-heading h2 {
  margin: 0;
  color: var(--color-black);
  font-size: clamp(1.2rem, 2.5vw, 1.55rem);
  font-weight: 750;
}

.policy-intro {
  margin: 22px 0 16px;
  color: #5c5757;
  font-size: 0.95rem;
}

.policy-checklist {
  display: grid;
  gap: 15px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.policy-checklist li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: #6a6565;
  font-size: 0.94rem;
  line-height: 1.4;
  transition: color var(--transition-fast);
}

.policy-checklist li > i {
  flex: 0 0 18px;
  padding-top: 1px;
  color: #a29b9b;
  font-size: 1rem;
}

.policy-checklist li.satisfied {
  color: #344d40;
}

.policy-checklist li.satisfied > i {
  color: #27814e;
}

.policy-checklist li.violated,
.policy-checklist li.violated > i {
  color: var(--color-error);
}

.policy-note {
  display: flex;
  gap: 12px;
  margin-top: auto;
  padding: 18px 16px 0;
  border-top: 1px solid #e9e5e5;
  color: #514b4b;
}

.policy-note > i {
  flex: 0 0 auto;
  padding-top: 2px;
  color: var(--color-primary);
}

.policy-note p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.55;
}

.status-message {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 20px;
  padding: 12px 14px;
  border-radius: var(--radius-small);
  font-size: 0.9rem;
  line-height: 1.45;
}

.status-message p {
  margin: 0;
}

.status-expired,
.status-error {
  background: #fdf0ef;
  color: #9f251f;
}

.status-must-set {
  background: #eef3fc;
  color: #244f86;
}

.status-message > i {
  flex: 0 0 auto;
  padding-top: 2px;
}

.page-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 250px;
  color: #5c5757;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #ded8d8;
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

.success-state {
  display: grid;
  justify-items: start;
  gap: 12px;
}

.success-icon {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border-radius: 50%;
  background: #e9f5ee;
  color: #27814e;
  font-size: 1.6rem;
}

.success-state h2 {
  margin: 0;
}

.success-state p {
  margin: 0 0 8px;
  color: #5c5757;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .password-layout {
    grid-template-columns: 1fr;
  }

  .policy-card {
    min-height: 0;
  }

  .policy-note {
    margin-top: 24px;
  }
}

@media (max-width: 480px) {
  .change-password-page {
    padding-inline: 14px;
  }

  .page-heading {
    text-align: left;
  }

  .form-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .form-actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
