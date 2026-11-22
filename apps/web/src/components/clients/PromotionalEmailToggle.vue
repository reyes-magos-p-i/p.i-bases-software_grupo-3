<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getClientPromotionalEmailSetting,
  saveClientPromotionalEmailSetting,
} from '@/services/client-promotional-emails.service'

const enabled = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const status = ref('')
let abort: AbortController | undefined

onMounted(load)
onBeforeUnmount(() => abort?.abort())

async function load() {
  abort?.abort()
  abort = new AbortController()
  loading.value = true
  error.value = ''
  try {
    enabled.value = (await getClientPromotionalEmailSetting(abort.signal)).enabled
  } catch {
    if (!abort.signal.aborted)
      error.value = 'No se pudo cargar tu preferencia de correos. Intenta nuevamente.'
  } finally {
    if (!abort.signal.aborted) loading.value = false
  }
}

async function toggle(event: Event) {
  const input = event.target as HTMLInputElement
  const next = input.checked
  saving.value = true
  error.value = ''
  status.value = ''
  try {
    enabled.value = (await saveClientPromotionalEmailSetting(next)).enabled
    status.value = enabled.value
      ? 'Recibirás los anuncios y promociones del mes en tu correo.'
      : 'Ya no recibirás anuncios y promociones por correo.'
  } catch {
    input.checked = enabled.value
    error.value = 'No se pudo guardar tu preferencia de correos. Intenta nuevamente.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="promotional-email-toggle" aria-labelledby="promotional-email-title">
    <div class="copy">
      <h3 id="promotional-email-title">Anuncios y promociones por correo</h3>
      <p>
        Recibe cada mes en tu correo registrado los anuncios y promociones de Cinetadel. Puedes
        cambiar esta opción cuando quieras.
      </p>
    </div>
    <label class="switch">
      <input
        type="checkbox"
        role="switch"
        :checked="enabled"
        :disabled="loading || saving"
        aria-describedby="promotional-email-status"
        @change="toggle"
      />
      <span>{{ loading ? 'Cargando…' : enabled ? 'Activado' : 'Desactivado' }}</span>
    </label>
    <p v-if="error" id="promotional-email-status" class="field-error" role="alert">{{ error }}</p>
    <p v-else id="promotional-email-status" class="status" aria-live="polite">{{ status }}</p>
    <button v-if="error && !loading" type="button" @click="load">Reintentar</button>
  </section>
</template>

<style scoped>
.promotional-email-toggle {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  margin-bottom: 1.5rem;
  border-radius: var(--radius-small);
  background: var(--info-background);
}
h3 {
  font-size: 1.1rem;
  font-weight: 700;
}
p {
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 44px;
  font-weight: 600;
}
.switch input {
  width: 2.75rem;
  height: 1.5rem;
  cursor: pointer;
}
.switch input:disabled {
  cursor: default;
  opacity: 0.65;
}
.field-error {
  color: var(--error-color);
  font-size: 0.875rem;
}
.status {
  font-size: 0.875rem;
  min-height: 1.25rem;
}
button {
  justify-self: start;
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  background: var(--button-secondary-background);
  color: var(--button-secondary-text);
  font-weight: 600;
}
button:focus-visible,
.switch input:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
</style>
