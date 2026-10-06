<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
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
  <main class="change-password-page landing-container">
    <h1>{{ isMustSet ? 'Configura tu contraseña' : 'Cambiar contraseña' }}</h1>

    <p v-if="statusLoading">Comprobando el estado de tu contraseña…</p>

    <template v-else>
      <p v-if="statusError" class="status-banner status-error" role="alert">
        {{ statusError }}
        <button type="button" @click="loadStatus">Reintentar</button>
      </p>

      <template v-else>
        <p v-if="status === 'expired'" class="status-banner status-expired" role="alert">
          Tu contraseña expiró. Debes definir una nueva para continuar.
        </p>
        <p v-else-if="isMustSet" class="status-banner status-must-set">
          Configura una contraseña local para tu cuenta.
        </p>

        <form v-if="!success" class="password-form" @submit.prevent="submit">
          <div v-if="!isMustSet" class="form-field">
            <label for="currentPassword">Contraseña actual</label>
            <input
              id="currentPassword"
              v-model="form.currentPassword"
              type="password"
              autocomplete="current-password"
            />
            <p v-if="errors.currentPassword" class="field-error">{{ errors.currentPassword }}</p>
          </div>

          <div class="form-field">
            <label for="newPassword">Nueva contraseña</label>
            <input
              id="newPassword"
              v-model="form.newPassword"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <ul class="policy-checklist" aria-label="Requisitos de contraseña segura">
            <li
              v-for="check in policyChecks"
              :key="check.code"
              :class="{ satisfied: check.satisfied, violated: violationCodes.includes(check.code) }"
            >
              <i :class="check.satisfied ? 'bi bi-check-circle' : 'bi bi-circle'" aria-hidden="true"></i>
              {{ check.label }}
            </li>
          </ul>

          <div class="form-field">
            <label for="confirmNewPassword">Confirmar nueva contraseña</label>
            <input
              id="confirmNewPassword"
              v-model="form.confirmNewPassword"
              type="password"
              autocomplete="new-password"
            />
            <p v-if="errors.confirm" class="field-error">{{ errors.confirm }}</p>
          </div>

          <div class="form-field">
            <label for="expirationDays">Vigencia de la contraseña</label>
            <select id="expirationDays" v-model.number="form.expirationDays">
              <option v-for="days in EXPIRATION_OPTIONS" :key="days" :value="days">{{ days }} días</option>
            </select>
          </div>

          <p v-if="errors.form" class="field-error form-error" role="alert">{{ errors.form }}</p>

          <div class="form-actions">
            <button type="submit" :disabled="loading">
              {{ loading ? 'Guardando…' : 'Guardar contraseña' }}
            </button>
            <button v-if="!isForced" type="button" class="secondary" @click="goHome">Cancelar</button>
          </div>
        </form>

        <div v-else class="password-success">
          <p>Tu contraseña se actualizó correctamente.</p>
          <button type="button" @click="goHome">Continuar</button>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.change-password-page {
  max-width: 480px;
  padding-block: 40px;
}

.password-form {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.form-field label {
  display: block;
  margin-bottom: 4px;
  font-weight: 600;
}

.form-field input,
.form-field select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d2d2d2;
  border-radius: 6px;
}

.field-error {
  margin: 4px 0 0;
  color: #b3261e;
  font-size: 0.85rem;
}

.status-banner {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
}

.status-expired,
.status-error {
  background: #fdecea;
  color: #b3261e;
}

.status-must-set {
  background: #eef3fc;
  color: #1a4a8a;
}

.policy-checklist {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
  color: #777;
}

.policy-checklist li.satisfied {
  color: #1e8e3e;
}

.policy-checklist li.violated {
  color: #b3261e;
}

.form-actions {
  display: flex;
  gap: 12px;
}

.form-actions .secondary {
  background: transparent;
  color: var(--color-dark);
}

.password-success {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  text-align: center;
}
</style>