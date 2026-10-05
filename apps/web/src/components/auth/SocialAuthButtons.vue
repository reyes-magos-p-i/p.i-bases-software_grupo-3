<script setup lang="ts">
import { loginWithFacebook } from '@/facebook-auth'
import { loginWithGoogle } from '@/services/authService'
const emit = defineEmits<{
  (e: 'google'): void
  (e: 'facebook', accessToken: string): void
  (e: 'close-modal'): void
}>()
const props = withDefaults(defineProps<{ mode?: 'register' | 'login'; disabled?: boolean }>(), {
  mode: 'register',
  disabled: false,
})

// OAuth handlers remain owned by their respective integrations.
async function onGoogle() {
  if (!props.disabled) emit('google')
  try {
    await loginWithGoogle()
    console.log('google login successful')
    emit('close-modal')
  } catch (error) {
    console.error('google login failed or was cancelled', error)
  }
}

// TODO (Diego): implementar el flujo OAuth de Facebook
async function onFacebook() {
  const response = await loginWithFacebook()
  if (response.status === 'connected' && response.authResponse) {
    emit('facebook', response.authResponse.accessToken)
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
