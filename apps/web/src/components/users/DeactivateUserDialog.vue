<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { deactivateUser } from '@/services/user.service'
import type { UserDeactivationSelection } from '@/types/user'

const props = defineProps<{ selection: UserDeactivationSelection | null }>()
const emit = defineEmits<{
  close: []
  deactivated: []
  'session-expired': []
  forbidden: []
}>()
const saving = ref(false)
const blocked = ref(false)
const error = ref('')
const feedback = ref<HTMLElement | null>(null)
let disposed = false

watch(
  () => props.selection,
  () => {
    error.value = ''
    blocked.value = false
  },
)
function close() {
  if (!saving.value) emit('close')
}
async function confirm() {
  const selection = props.selection
  if (!selection || saving.value || blocked.value) return
  saving.value = true
  error.value = ''
  try {
    await deactivateUser(selection)
    if (!disposed) emit('deactivated')
  } catch (failure) {
    if (disposed) return
    const status = isAxiosError(failure) ? failure.response?.status : undefined
    blocked.value = true
    if (status === 401) {
      error.value = 'La sesión ha expirado. Inicia sesión nuevamente.'
      emit('session-expired')
    } else if (status === 403) {
      error.value = 'No tienes permiso para desactivar este usuario.'
      emit('forbidden')
    } else if (status === 404) {
      error.value = 'El usuario seleccionado no existe. Cierra y actualiza el listado.'
    } else if (status === 409) {
      const message: unknown = isAxiosError(failure) ? failure.response?.data?.message : undefined
      error.value =
        message === 'No puedes desactivar tu propia cuenta.' ||
        message === 'Debe permanecer al menos un administrador activo.' ||
        message === 'El cliente ya está desactivado.' ||
        message === 'El empleado ya está desactivado.'
          ? message
          : 'No se puede desactivar este usuario. Cierra y actualiza el listado.'
    } else {
      error.value =
        'No se pudo confirmar la desactivación. Cierra y actualiza el listado antes de intentarlo nuevamente.'
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
  <BaseModal
    :open="selection !== null"
    title="Desactivar usuario"
    :close-disabled="saving"
    @close="close"
  >
    <div class="user-deactivation-content" :aria-busy="saving">
      <template v-if="selection">
        <p>
          ¿Deseas desactivar a <strong>{{ selection.name }}</strong> ({{ selection.displayId }})?
        </p>
        <p class="deactivation-warning">
          El usuario dejará de aparecer en el sistema y perderá el acceso. Sus datos y registros
          relacionados se conservarán.
        </p>
        <p v-if="error" ref="feedback" class="deactivation-error" role="alert" tabindex="-1">
          {{ error }}
        </p>
        <footer>
          <button type="button" class="secondary" :disabled="saving" @click="close">
            Cancelar
          </button>
          <button type="button" class="primary" :disabled="saving || blocked" @click="confirm">
            {{ saving ? 'Desactivando…' : 'Confirmar desactivación' }}
          </button>
        </footer>
      </template>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.user-deactivation-content)::backdrop) {
  background: color-mix(in srgb, var(--color-black) 55%, transparent);
}
:global(.app-modal-card:has(.user-deactivation-content)) {
  width: min(640px, 100%);
  max-width: 640px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--color-background);
  color: var(--color-dark);
  overflow: hidden;
}
:global(.app-modal-card:has(.user-deactivation-content) .app-modal-title) {
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--color-primary);
  color: var(--color-white);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}
:global(.app-modal-card:has(.user-deactivation-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--color-white);
}
.user-deactivation-content {
  padding: 24px;
  overflow-wrap: anywhere;
}
.deactivation-warning {
  padding: 16px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-white);
}
.deactivation-error {
  color: var(--color-error);
}
footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}
button {
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-small);
  font: inherit;
}
.primary {
  background: var(--color-primary);
  color: var(--color-white);
}
.secondary {
  background: var(--color-white);
  color: var(--color-primary);
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
@media (max-width: 575px) {
  .user-deactivation-content {
    padding: 20px 16px;
  }
  footer button {
    flex: 1;
  }
}
</style>
