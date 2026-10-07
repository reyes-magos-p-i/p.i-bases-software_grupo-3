<script setup lang="ts">
import { loginWithFacebook } from '@/facebook-auth'
import { facebookLogin, loginWithGoogle } from '@/services/authService'
import type { ClientIdentity } from '@/types/client-auth'

const emit = defineEmits<{
  (e: 'authenticated', identity: ClientIdentity): void
  (e: 'error', message: string): void
}>()
const props = withDefaults(defineProps<{ mode?: 'register' | 'login'; disabled?: boolean }>(), {
  mode: 'register',
  disabled: false,
})

async function onGoogle() {
  if (props.disabled) return
  try {
    emit('authenticated', await loginWithGoogle())
  } catch {
    emit('error', 'No se pudo iniciar sesión con Google. Inténtalo nuevamente.')
  }
}

async function onFacebook() {
  if (props.disabled) return
  try {
    const response = await loginWithFacebook()
    if (response.status === 'connected' && response.authResponse) {
      const result = await facebookLogin(response.authResponse.accessToken)
      emit('authenticated', result.client)
      return
    }
    emit('error', 'No se pudo conectar con Facebook. Inténtalo nuevamente.')
  } catch {
    emit('error', 'No se pudo conectar con Facebook. Inténtalo nuevamente.')
  }
}
</script>

<template>
  <div class="d-grid gap-2">
    <button type="button" class="btn btn-light border" :disabled="disabled" @click="onGoogle">
      <i class="bi bi-google me-2" aria-hidden="true"></i
      >{{ mode === 'login' ? 'Iniciar sesión' : 'Registrarse' }} con Google
    </button>
    <button type="button" class="btn btn-light border" :disabled="disabled" @click="onFacebook">
      <i class="bi bi-facebook me-2" aria-hidden="true"></i
      >{{ mode === 'login' ? 'Iniciar sesión' : 'Registrarse' }} con Facebook
    </button>
  </div>
</template>
