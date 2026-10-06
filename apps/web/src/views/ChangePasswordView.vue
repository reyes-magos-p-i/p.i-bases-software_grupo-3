<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import {
  ChangePasswordError,
  changeClientPassword,
  getClientPasswordStatus,
  type ChangeClientPasswordPayload,
  type ClientPasswordStatus,
} from '@/services/authService'
import { clientSession } from '@/services/client-session.service'
import { checkPasswordPolicy, isPasswordPolicySatisfied } from '@/utils/password-policy'

const router = useRouter()
const user = clientSession.user

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

const policyChecks = computed(() =>
  checkPasswordPolicy(form.newPassword, {
    email: user.value?.email,
    firstName: user.value?.firstName,
  }),
)
const policySatisfied = computed(() => isPasswordPolicySatisfied(policyChecks.value))

async function loadStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    status.value = await getClientPasswordStatus()
  } catch {
    statusError.value = 'No se pudo comprobar el estado de tu contraseña. Intenta de nuevo.'
  } finally {
    statusLoading.value = false
  }
}

onMounted(loadStatus)

async function submit() {
  if (loading.value) return
  errors.currentPassword = undefined
  errors.confirm = undefined
  errors.form = undefined
  violationCodes.value = []

  if (!isMustSet.value && !form.currentPassword) {
    errors.currentPassword = 'Ingresa tu contraseña actual'
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
  try {
    const payload: ChangeClientPasswordPayload = {
      newPassword: form.newPassword,
      confirmNewPassword: form.confirmNewPassword,
      expirationDays: form.expirationDays,
    }
    if (!isMustSet.value) payload.currentPassword = form.currentPassword
    await changeClientPassword(payload)
    success.value = true
    status.value = 'valid'
  } catch (error) {
    if (error instanceof ChangePasswordError) {
      if (error.code === 'CURRENT_PASSWORD_INCORRECT') errors.currentPassword = error.message
      else if (error.code === 'PASSWORDS_DO_NOT_MATCH') errors.confirm = error.message
      else if (error.code === 'PASSWORD_POLICY_VIOLATION') {
        errors.form = error.message
        violationCodes.value = error.violations ?? []
      } else errors.form = error.message
    } else {
      errors.form = 'No se pudo actualizar la contraseña, intenta de nuevo.'
    }
  } finally {
    loading.value = false
  }
}

function goHome() {
  void router.push('/')
}
</script>

<template>
  <AppHeader />

  <main class="change-password-page">
    <div class="change-password-container">
      <header class="page-heading">
        <p class="page-eyebrow">SEGURIDAD DE LA CUENTA</p>
        <h1>{{ isMustSet ? 'Configura tu contraseña' : 'Cambiar contraseña' }}</h1>
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
            <button type="button" class="primary-button" @click="loadStatus">Reintentar</button>
          </template>

          <template v-else-if="success">
            <div class="success-state" role="status">
              <span class="success-icon"><i class="bi bi-check-lg" aria-hidden="true"></i></span>
              <h2 id="password-form-title">Contraseña actualizada</h2>
              <p>Tu contraseña se actualizó correctamente.</p>
              <button type="button" class="primary-button continue-button" @click="goHome">
                Continuar
              </button>
            </div>
          </template>

          <template v-else>
            <h2 id="password-form-title">
              {{ isMustSet ? 'Crear contraseña' : 'Cambiar contraseña' }}
            </h2>

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
                <label for="currentPassword">Contraseña actual</label>
                <div class="password-control">
                  <input
                    id="currentPassword"
                    v-model="form.currentPassword"
                    :type="showCurrentPassword ? 'text' : 'password'"
                    autocomplete="current-password"
                    :aria-invalid="!!errors.currentPassword"
                    :aria-describedby="errors.currentPassword ? 'current-password-error' : undefined"
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
                    :aria-invalid="!!errors.confirm"
                    :aria-describedby="errors.confirm ? 'confirm-password-error' : undefined"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    :aria-controls="'confirmNewPassword'"
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
                <select id="expirationDays" v-model.number="form.expirationDays">
                  <option v-for="days in EXPIRATION_OPTIONS" :key="days" :value="days">
                    {{ days }} días
                  </option>
                </select>
              </div>

              <p v-if="errors.form" class="field-error form-error" role="alert">
                {{ errors.form }}
              </p>

              <div class="form-actions">
                <button type="submit" class="primary-button" :disabled="loading">
                  <i class="bi bi-shield-lock" aria-hidden="true"></i>
                  {{ loading ? 'Guardando…' : 'Guardar contraseña' }}
                </button>
                <button
                  v-if="!isForced"
                  type="button"
                  class="secondary-button"
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
            <span class="policy-icon"><i class="bi bi-shield-lock-fill" aria-hidden="true"></i></span>
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

  <AppFooter />
</template>

<style scoped>
.change-password-page {
  min-height: 560px;
  padding: clamp(36px, 6vw, 72px) 16px clamp(48px, 7vw, 88px);
  font-family: inherit;
  background:
    radial-gradient(ellipse at 78% 18%, rgb(54 8 12 / 5%), transparent 38%),
    var(--color-background);
}

.change-password-container {
  width: min(100%, 1040px);
  margin-inline: auto;
}

.page-heading {
  margin-bottom: 30px;
  text-align: center;
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

.form-card,
.policy-card {
  border: 1px solid #e4e1e1;
  border-radius: var(--radius-medium);
  background: var(--color-white);
  box-shadow: 0 8px 28px rgb(13 13 13 / 8%);
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
  background:
    linear-gradient(145deg, rgb(54 8 12 / 3%), transparent 55%),
    var(--color-white);
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
