<script setup lang="ts">

import CustomGoogleButton from '../Google/CustomGoogleButton.vue';

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
    <CustomGoogleButton @click="onGoogle">

    </CustomGoogleButton>

    <button type="button" class="btn btn-light border" @click="onFacebook">
      <i class="bi bi-facebook me-2"></i>Registrarse con Facebook
    </button>
  </div>
</template>
