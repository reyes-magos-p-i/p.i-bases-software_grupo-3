<script setup lang="ts">
import { ref } from 'vue'
import logo from '@/assets/logos/cinetadel-logo.png'
import RegisterModal from '@/components/auth/RegisterModal.vue'
import LoginModal from '@/components/auth/LoginModal.vue'

const activeModal = ref<'register' | 'login' | null>(null)
const loginMode = ref<'client' | 'employee'>('client')

function openLogin() {
  loginMode.value = 'client'
  activeModal.value = 'login'
}
</script>

<template>
  <header class="site-header">
    <nav class="landing-container navbar-content">
      <RouterLink to="/" class="brand" aria-label="Ir a la página principal de Cinetadel">
        <img :src="logo" alt="Cinetadel" class="brand-logo" />
      </RouterLink>
      <div class="navbar-actions">
        <button type="button" class="login-button" @click="openLogin">Iniciar sesión</button>
        <button type="button" class="register-button" @click="activeModal = 'register'">
          Registrarse
        </button>
        <!-- TODO(any): Handle the registered user and update the UI accordingly, ref -> SCRUM-106, SCRUM-37. -->
        <RegisterModal
          :open="activeModal === 'register'"
          @close="activeModal = null"
          @registered="activeModal = null"
        />
        <LoginModal
          :open="activeModal === 'login'"
          :mode="loginMode"
          @close="activeModal = null"
          @switch-mode="loginMode = $event"
        />
      </div>
    </nav>
  </header>
</template>

<style scoped>
.site-header {
  width: 100%;
  background-color: var(--color-light_gray);
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
