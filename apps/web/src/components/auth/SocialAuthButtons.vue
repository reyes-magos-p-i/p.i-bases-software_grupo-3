<script setup lang="ts">
import { loginWithFacebook } from '@/facebook-auth'
const emit = defineEmits<{
  (e: 'google'): void
  (e: 'facebook', accessToken: string): void
}>()

// TODO (Silvio): implementar el flujo OAuth de Google
function onGoogle() {
  emit('google')
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
    <button type="button" class="btn btn-light border" @click="onGoogle">
      <i class="bi bi-google me-2"></i>Registrarse con Google
    </button>
    <button type="button" class="btn btn-light border" @click="onFacebook">
      <i class="bi bi-facebook me-2"></i>Registrarse con Facebook
    </button>
  </div>
</template>