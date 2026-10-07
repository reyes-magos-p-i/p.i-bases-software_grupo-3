<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { deleteTheater } from '@/services/theater.service'
import type { Theater } from '@/types/theater'

const props = defineProps<{ theater: Theater | null }>()
const emit = defineEmits<{ close: []; deactivated: []; 'session-expired': [] }>()
const saving = ref(false)
const blocked = ref(false)
const error = ref('')
const feedback = ref<HTMLElement | null>(null)
let disposed = false

watch(() => props.theater, () => {
  error.value = ''
  blocked.value = false
})

function close() {
  if (!saving.value) emit('close')
}

async function confirm() {
  const theater = props.theater
  if (!theater || saving.value || blocked.value) return
  saving.value = true
  error.value = ''
  try {
    await deleteTheater(theater.theaterId)
    if (!disposed) emit('deactivated')
  } catch (failure) {
    if (disposed) return
    const status = isAxiosError(failure) ? failure.response?.status : undefined
    blocked.value = true
    if (status === 401) {
      error.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
      emit('session-expired')
    } else if (status === 403) {
      error.value = 'No tienes permiso para desactivar esta sala.'
    } else if (status === 404) {
      error.value = 'La sala seleccionada no existe. Cierra y actualiza el listado.'
    } else {
      error.value = 'No se pudo confirmar la desactivación. Cierra y actualiza el listado antes de intentarlo nuevamente.'
    }
    await nextTick()
    feedback.value?.focus()
  } finally {
    if (!disposed) saving.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <BaseModal :open="theater !== null" title="Desactivar sala" :close-disabled="saving" @close="close">
    <div v-if="theater" class="theater-deactivation-content" :aria-busy="saving">
      <p>¿Deseas desactivar la sala <strong>S{{ theater.theaterId }}</strong>?</p>
      <p class="deactivation-warning">La sala dejará de estar disponible, pero sus datos se conservarán.</p>
      <p v-if="error" ref="feedback" class="deactivation-error" role="alert" tabindex="-1">{{ error }}</p>
      <footer>
        <button type="button" class="secondary" :disabled="saving" @click="close">Cancelar</button>
        <button type="button" class="primary" :disabled="saving || blocked" @click="confirm">
          {{ saving ? 'Desactivando…' : 'Confirmar desactivación' }}
        </button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-card:has(.theater-deactivation-content)) { width: min(640px, 100%); max-width: 640px; }
.theater-deactivation-content { padding: 8px 0 0; }
.deactivation-warning { padding: 16px; border-left: 3px solid var(--color-primary); background: var(--color-white); }
.deactivation-error { color: var(--color-error); }
footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
button { min-height: 42px; padding: 9px 16px; border: 1px solid var(--color-primary); border-radius: var(--radius-small); font: inherit; }
.primary { color: var(--color-white); background: var(--color-primary); }
.secondary { color: var(--color-primary); background: var(--color-white); }
button:disabled { opacity: .6; cursor: not-allowed; }
@media (max-width: 575px) { footer button { flex: 1; } }
</style>
