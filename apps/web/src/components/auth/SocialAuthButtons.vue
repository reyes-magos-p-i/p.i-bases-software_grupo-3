<script setup lang="ts">
import { loginWithGoogle } from '@/services/authService';

const emit = defineEmits<{ (e: 'google'): void; (e: 'facebook'): void }>()

// TODO (Silvio): implementar el flujo OAuth de Google
async function onGoogle() {
  emit('google')
  try{
    await loginWithGoogle()

    console.log('google login succesful')

  }catch(error){
    console.error('google login fauiles', error)

  }

}

// TODO (Diego): implementar el flujo OAuth de Facebook
function onFacebook() {
  emit('facebook')
}
</script>

<template>
  <div class="d-grid gap-2">
    <button type="button" class="btn btn-light border"  @click="onGoogle">
      <i class="bi bi-google me-2"></i>Registrarse con Google
    </button>

    <button type="button" class="btn btn-light border" @click="onFacebook">
      <i class="bi bi-facebook me-2"></i>Registrarse con Facebook
    </button>
  </div>
</template>
