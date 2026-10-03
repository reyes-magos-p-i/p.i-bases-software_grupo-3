<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import logo from '@/assets/logos/cinetadel-logo.png'
import RegisterModal from '@/components/auth/RegisterModal.vue'
import LoginModal from '@/components/auth/LoginModal.vue'
import AccountMenu from '@/components/common/AccountMenu.vue'
import { EmployeeAuthError } from '@/services/authService'
import {
  authenticateEmployee,
  employeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import type { EmployeeLoginRequest } from '@/types/employee-auth'
import type { ClientIdentity } from '@/types/client-auth'

const activeModal = ref<'register' | 'login' | null>(null)
const clientUser = ref<ClientIdentity | null>(null)
const loginMode = ref<'client' | 'employee'>('client')
const router = useRouter()
const route = useRoute()
const sessionUser = employeeSession.user
const submitting = ref(false)
const loginError = ref('')
const recoveryError = ref('')
const recovering = ref(false)
const retryAfterSeconds = ref(0)
let retryUntil = 0
let retryTimer: ReturnType<typeof setInterval> | undefined
let disposed = false

function clearRetryTimer() {
  if (retryTimer) clearInterval(retryTimer)
  retryTimer = undefined
}

function updateRetryDelay() {
  retryAfterSeconds.value = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000))
  if (!retryAfterSeconds.value) clearRetryTimer()
}

async function recoverSession() {
  if (recovering.value) return
  recovering.value = true
  recoveryError.value = ''
  try {
    await restoreEmployeeSession(true)
  } catch {
    if (!disposed)
      recoveryError.value = 'No se pudo comprobar tu sesión. Puedes volver a intentarlo.'
  } finally {
    if (!disposed) recovering.value = false
  }
}

async function submitLogin(credentials: EmployeeLoginRequest) {
  updateRetryDelay()
  if (submitting.value || loginMode.value !== 'employee' || retryAfterSeconds.value > 0) return
  submitting.value = true
  loginError.value = ''
  try {
    const identity = await authenticateEmployee(credentials)
    if (!disposed && identity) {
      activeModal.value = null
      await router.push('/dashboard')
    }
  } catch (error) {
    if (disposed) return
    loginError.value =
      error instanceof Error ? error.message : 'No se pudo iniciar sesión. Inténtalo nuevamente.'
    if (error instanceof EmployeeAuthError && error.status === 429) {
      retryUntil = Date.now() + (error.retryAfterSeconds ?? 60) * 1000
      clearRetryTimer()
      updateRetryDelay()
      retryTimer = setInterval(updateRetryDelay, 1000)
    }
  } finally {
    if (!disposed) submitting.value = false
  }
}

function changeLoginMode(mode: 'client' | 'employee') {
  if (submitting.value) return
  loginMode.value = mode
  loginError.value = ''
}

function closeLogin() {
  if (submitting.value) return
  activeModal.value = null
  loginError.value = ''
  if (route.query.login === 'employee') {
    const query = { ...route.query }
    delete query.login
    delete query.reason
    void router.replace({ path: route.path, query })
  }
}

watch(
  () => route.query,
  (query) => {
    if (query.login !== 'employee') return
    loginMode.value = 'employee'
    activeModal.value = 'login'
    loginError.value =
      route.query.reason === 'unavailable'
        ? 'No se pudo comprobar la sesión. Inténtalo nuevamente.'
        : route.query.reason === 'expired'
          ? 'Tu sesión terminó. Inicia sesión nuevamente.'
          : ''
  },
  { immediate: true },
)

onMounted(() => {
  if (employeeSession.status.value === 'error') {
    recoveryError.value = 'No se pudo comprobar tu sesión. Puedes volver a intentarlo.'
  } else {
    void recoverSession()
  }
})
onBeforeUnmount(() => {
  disposed = true
  clearRetryTimer()
})

function openLogin() {
  loginError.value = ''
  loginMode.value = 'client'
  activeModal.value = 'login'
}

function handleClientLogin(identity?: ClientIdentity) {
  activeModal.value = null
  if (identity) {
    clientUser.value = identity
    loginError.value = ''
  }
}

function logoutClient() {
  localStorage.removeItem('accessToken')
  clientUser.value = null
  activeModal.value = null
}
</script>

<template>
  <header class="site-header">
    <nav class="landing-container navbar-content">
      <RouterLink to="/" class="brand" aria-label="Ir a la página principal de Cinetadel">
        <img :src="logo" alt="Cinetadel" class="brand-logo" />
      </RouterLink>
      <div class="navbar-actions">
        <AccountMenu v-if="clientUser" :user="clientUser" @logout="logoutClient" />
        <RouterLink v-else-if="sessionUser" to="/dashboard" class="login-button dashboard-link"
          >Ir al dashboard</RouterLink
        >
        <button v-else type="button" class="login-button" @click="openLogin">Iniciar sesión</button>
        <button
          v-if="!clientUser"
          type="button"
          class="register-button"
          @click="activeModal = 'register'"
        >
          Registrarse
        </button>
        <RegisterModal
          :open="activeModal === 'register'"
          @close="activeModal = null"
          @registered="activeModal = null"
          @authenticated="handleClientLogin"
        />
        <LoginModal
          :open="activeModal === 'login'"
          :mode="loginMode"
          :enabled="loginMode === 'employee'"
          :submitting="submitting"
          :error-message="loginError"
          :retry-after-seconds="loginMode === 'employee' ? retryAfterSeconds : 0"
          @close="closeLogin"
          @authenticated="handleClientLogin"
          @switch-mode="changeLoginMode"
          @submit="submitLogin"
        />
      </div>
    </nav>
    <p v-if="recoveryError" class="landing-container session-feedback" role="status">
      {{ recoveryError }}
      <button type="button" :disabled="recovering" @click="recoverSession">
        {{ recovering ? 'Comprobando…' : 'Reintentar' }}
      </button>
    </p>
  </header>
</template>

<style scoped>
.site-header {
  width: 100%;
  background-color: var(--color-light_gray);
}

.dashboard-link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.session-feedback {
  padding-block: 12px;
  margin-bottom: 0;
}
.session-feedback button {
  min-height: 44px;
  margin-left: 8px;
}

.navbar-content {
  min-height: 72px;
  display: flex;
  align-items: stretch;
  justify-content: space-between;

  gap: 24px;
}

.brand {
  display: flex;
  align-items: center;
}

.brand-logo {
  width: 54px;
  height: 54px;

  object-fit: contain;
}

.navbar-actions {
  display: flex;
  align-items: stretch;
  gap: 0;
}

.register-button,
.login-button {
  color: inherit;
  background-color: transparent;
  border: none;
  box-sizing: border-box;
  padding: 30px;
  font-weight: 700;
}

.register-button:hover,
.login-button:hover {
  color: var(--color-white);
  background-color: var(--color-primary);
}

.register-button:focus-visible,
.login-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -4px;
}

@media (max-width: 576px) {
  .navbar-content {
    min-height: 64px;
  }

  .brand-logo {
    width: 44px;
    height: 44px;
  }

  .navbar-actions {
    gap: 6px;
  }

  .register-button,
  .login-button {
    padding: 16px 10px;
    font-size: 0.875rem;
  }
}
</style>
