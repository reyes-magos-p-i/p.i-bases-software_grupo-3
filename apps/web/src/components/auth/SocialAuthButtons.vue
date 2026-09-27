<script setup lang="ts">
const emit = defineEmits<{ (e: 'google'): void; (e: 'facebook'): void }>()

// TODO (Silvio): implementar el flujo OAuth de Google
function onGoogle() {
  emit('google')
}

// TODO (Diego): implementar el flujo OAuth de Facebook
function onFacebook() {
  emit('facebook')
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