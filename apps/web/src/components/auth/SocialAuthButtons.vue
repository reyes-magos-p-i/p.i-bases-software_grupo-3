<script setup lang="ts">
const props = withDefaults(defineProps<{ mode?: 'register' | 'login'; disabled?: boolean }>(), {
  mode: 'register',
  disabled: false,
})
const emit = defineEmits<{ (e: 'google'): void; (e: 'facebook'): void }>()

// OAuth handlers remain owned by their respective integrations.
function onGoogle() {
  if (!props.disabled) emit('google')
}

function onFacebook() {
  if (!props.disabled) emit('facebook')
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
