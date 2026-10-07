<script setup lang="ts">
import { ref } from 'vue'
import { loginWithFacebook } from '@/facebook-auth'
import { facebookLogin, loginWithGoogle } from '@/services/authService'
import type { ClientIdentity } from '@/types/client-auth'

const emit = defineEmits<{
  (e: 'authenticated', identity: ClientIdentity): void
  (e: 'error', message: string): void
  (e: 'busy', value: boolean): void
}>()
const props = withDefaults(defineProps<{ mode?: 'register' | 'login'; disabled?: boolean }>(), {
  mode: 'register',
  disabled: false,
})
const pending = ref(false)

function setPending(value: boolean) {
  pending.value = value
  emit('busy', value)
}

async function onGoogle() {
  if (props.disabled || pending.value) return
  setPending(true)
  try {
    emit('authenticated', await loginWithGoogle())
  } catch {
    emit('error', 'No se pudo iniciar sesión con Google. Inténtalo nuevamente.')
  } finally {
    setPending(false)
  }
}

async function onFacebook() {
  if (props.disabled || pending.value) return
  setPending(true)
  try {
    const response = await loginWithFacebook()
    if (response.status === 'connected' && response.authResponse) {
      const result = await facebookLogin(response.authResponse.accessToken)
      emit('authenticated', result.client)
    }
  } catch {
    emit('error', 'No se pudo conectar con Facebook. Inténtalo nuevamente.')
  } finally {
    setPending(false)
  }
}
</script>

<template>
  <div class="d-grid gap-2" :aria-busy="pending">
    <button
      type="button"
      class="btn btn-light border"
      :disabled="disabled || pending"
      @click="onGoogle"
    >
      <i class="bi bi-google me-2" aria-hidden="true"></i
      >{{ mode === 'login' ? 'Iniciar sesión' : 'Registrarse' }} con Google
    </button>
    <button
      type="button"
      class="btn btn-light border"
      :disabled="disabled || pending"
      @click="onFacebook"
    >
      <i class="bi bi-facebook me-2" aria-hidden="true"></i
      >{{ mode === 'login' ? 'Iniciar sesión' : 'Registrarse' }} con Facebook
    </button>
  </div>
</template>
