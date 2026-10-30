<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import logo from '@/assets/logos/cinetadel-logo.png'
import RegisterModal from '@/components/auth/RegisterModal.vue'
import LoginModal from '@/components/auth/LoginModal.vue'
import AccountMenu from '@/components/common/AccountMenu.vue'
import {
  EmployeeAuthError,
  getClientPasswordStatus,
  getClientSession,
  loginClient,
} from '@/services/authService'
import {
  authenticateEmployee,
  employeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'
import {
  hasClientSession,
  clearClientAuth,
  clientSession,
  restoreClientSession,
  clearClientSession,
} from '@/services/client-session.service'
import { authErrorMessage, authErrorStatus } from '@/utils/auth-errors'
import {
  announcePasswordExpiry,
  dismissPasswordExpiry,
  expectPasswordExpiryNotice,
} from '@/services/password-expiry-notice'
import type { EmployeeLoginRequest } from '@/types/employee-auth'
import type { ClientIdentity } from '@/types/client-auth'

defineProps<{ overlay?: boolean }>()

const PASSWORD_PATH = '/account/password'
const activeModal = ref<'register' | 'login' | null>(null)
const clientUser = clientSession.user
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

async function enforceClientPasswordStatus() {
  const user = clientUser.value
  if (
    !user ||
    !hasClientSession() ||
    route.path === PASSWORD_PATH ||
    route.path === '/recover-password' ||
    route.path === '/account/confirm-email'
  )
    return

  try {
    const expiry = await getClientPasswordStatus()
    if (disposed || clientUser.value !== user || !hasClientSession()) return
    announcePasswordExpiry(expiry)
    if (expiry.status !== 'valid') {
      await router.replace({ path: PASSWORD_PATH, query: { reason: expiry.status } })
    }
  } catch (error) {
    if (!disposed && clientUser.value === user && hasClientSession()) {
      if (authErrorStatus(error) === 401) {
        clearClientSession()
        await router.replace({ path: '/', query: { login: 'client', reason: 'expired' } })
      } else {
        recoveryError.value = authErrorMessage(
          error,
          'No se pudo comprobar el estado de tu contraseña. Puedes volver a intentarlo.',
        )
      }
    }
  }
}

async function recoverSession() {
  if (recovering.value) return
  recovering.value = true
  recoveryError.value = ''
  const results = await Promise.allSettled([
    restoreEmployeeSession(true),
    restoreClientSession(getClientSession),
  ])
  if (results[1]?.status === 'fulfilled' && !disposed) {
    await enforceClientPasswordStatus()
  }
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') {
    if (!disposed)
      recoveryError.value =
        failure.reason instanceof EmployeeAuthError
          ? failure.reason.message
          : authErrorMessage(
              failure.reason,
              'No se pudo comprobar tu sesión. Puedes volver a intentarlo.',
            )
  }
  if (!disposed) recovering.value = false
}

async function submitLogin(credentials: EmployeeLoginRequest) {
  updateRetryDelay()
  if (submitting.value || retryAfterSeconds.value > 0) return
  submitting.value = true
  loginError.value = ''
  try {
    const client = loginMode.value === 'client'
    if (client) {
      const identity = await loginClient(credentials)
      if (disposed) return
      clientUser.value = identity
      activeModal.value = null
      expectPasswordExpiryNotice()
      await router.push('/')
      await enforceClientPasswordStatus()
    } else {
      const identity = await authenticateEmployee(credentials)
      if (disposed || !identity) return
      activeModal.value = null
      // The dashboard checks the password status when it opens.
      expectPasswordExpiryNotice()
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
  if (route.query.login === 'employee' || route.query.login === 'client') {
    const query = { ...route.query }
    delete query.login
    delete query.reason
    void router.replace({ path: route.path, query })
  }
}

watch(
  () => route.query,
  (query) => {
    if (query.login !== 'employee' && query.login !== 'client') return
    loginMode.value = query.login
    activeModal.value = 'login'
    loginError.value =
      route.query.reason === 'unavailable'
        ? (query.login === 'employee' ? employeeSession.error.value : clientSession.error.value) ||
          'No se pudo comprobar la sesión. Inténtalo nuevamente.'
        : route.query.reason === 'expired'
          ? 'Tu sesión terminó. Inicia sesión nuevamente.'
          : ''
  },
  { immediate: true },
)

onMounted(() => {
  if (employeeSession.status.value === 'error') {
    recoveryError.value =
      employeeSession.error.value || 'No se pudo comprobar tu sesión. Puedes volver a intentarlo.'
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

async function handleClientLogin(identity?: ClientIdentity) {
  if (disposed) return
  activeModal.value = null
  if (identity) {
    clientUser.value = identity
    loginError.value = ''
    expectPasswordExpiryNotice()
    await router.push('/')
    await enforceClientPasswordStatus()
  }
}

async function logoutClient() {
  dismissPasswordExpiry()
  try {
    await clearClientAuth()
    activeModal.value = null
    await router.replace('/')
  } catch (error) {
    recoveryError.value = authErrorMessage(
      error,
      'Se cerró la sesión local, pero no se pudo confirmar el cierre con el proveedor.',
    )
  }
}

function goToChangePassword() {
  void router.push('/account/password')
}
</script>

<template>
  <header class="site-header" :class="{ 'site-header-overlay': overlay }">
    <nav class="landing-container navbar-content">
      <RouterLink to="/" class="brand" aria-label="Ir a la página principal de Cinetadel">
        <img :src="logo" alt="Cinetadel" class="brand-logo" />
      </RouterLink>
      <div class="navbar-actions">
        <AccountMenu
          v-if="clientUser"
          :user="clientUser"
          @logout="logoutClient"
          @change-password="goToChangePassword"
          @profile="router.push('/account/profile')"
        />
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
          @authenticated="handleClientLogin"
        />
        <LoginModal
          :open="activeModal === 'login'"
          :mode="loginMode"
          enabled
          :submitting="submitting"
          :error-message="loginError"
          :retry-after-seconds="retryAfterSeconds"
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
  background-color: var(--navbar-background);
  color: var(--text-on-dark);
}

.site-header-overlay {
  background-color: transparent;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
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
  color: var(--button-text);
  background: var(--button-background);
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
  color: var(--navbar-button-text);
  background-color: transparent;
  border: none;
  box-sizing: border-box;
  padding: 24px 30px;
  font-weight: 700;
}

.register-button:hover,
.login-button:hover {
  color: var(--navbar-button-text);
  background-color: var(--navbar-button-hover-background);
}

.navbar-actions > .register-button {
  position: relative;
}

.navbar-actions > .register-button::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 1px;
  height: 22px;
  background-color: var(--navbar-separator-color);
  transform: translateY(-50%);
}

.register-button:focus-visible,
.login-button:focus-visible {
  outline: 2px solid var(--focus-on-dark);
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
