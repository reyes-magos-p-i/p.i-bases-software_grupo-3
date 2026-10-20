<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import BaseModal from '@/components/common/BaseModal.vue'
import { activateUser, deactivateUser } from '@/services/user.service'
import type { UserStatusSelection } from '@/types/user'

const props = defineProps<{ selection: UserStatusSelection | null }>()
const emit = defineEmits<{
  close: []
  'status-changed': [status: 'ACTIVE' | 'INACTIVE']
  'session-expired': []
  forbidden: []
}>()
const activating = computed(() => props.selection?.status === 'INACTIVE')
const action = computed(() =>
  activating.value
    ? {
        verb: 'activar',
        title: 'Activar usuario',
        pending: 'Activando…',
        confirm: 'Confirmar activación',
        noun: 'activación',
      }
    : {
        verb: 'desactivar',
        title: 'Desactivar usuario',
        pending: 'Desactivando…',
        confirm: 'Confirmar desactivación',
        noun: 'desactivación',
      },
)
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
function describeFailure(failure: unknown): string {
  const status = isAxiosError(failure) ? failure.response?.status : undefined
  if (status === 401) {
    emit('session-expired')
    return 'La sesión ha expirado. Inicia sesión nuevamente.'
  } else if (status === 403) {
    emit('forbidden')
    return `Error 403: No tienes permiso para ${action.value.verb} este usuario.`
  } else if (status === 404) {
    return 'Error 404: El usuario seleccionado no existe. Cierra y actualiza el listado.'
  } else if (status === 409) {
    const message: unknown = isAxiosError(failure) ? failure.response?.data?.message : undefined
    const knownConflicts = [
      'No puedes desactivar tu propia cuenta.',
      'Debe permanecer al menos un administrador activo.',
      'El cliente ya está desactivado.',
      'El empleado ya está desactivado.',
      'El cliente ya está activo.',
      'El empleado ya está activo.',
    ]
    return typeof message === 'string' && knownConflicts.includes(message)
      ? message
      : `No se puede ${action.value.verb} este usuario. Cierra y actualiza el listado.`
  } else {
    const prefix = status ? 'Error ' + status + ': ' : ''
    return `${prefix}No se pudo confirmar la ${action.value.noun}. Cierra y actualiza el listado antes de intentarlo nuevamente.`
  }
}
async function confirm() {
  const selection = props.selection
  if (!selection || saving.value || blocked.value) return
  saving.value = true
  error.value = ''
  try {
    const targetStatus = selection.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    if (targetStatus === 'ACTIVE') await activateUser(selection)
    else await deactivateUser(selection)
    if (!disposed) emit('status-changed', targetStatus)
  } catch (failure) {
    if (disposed) return
    blocked.value = true
    error.value = describeFailure(failure)
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
    :title="action.title"
    :close-disabled="saving"
    @close="close"
  >
    <div class="user-status-content" :aria-busy="saving">
      <template v-if="selection">
        <p>
          ¿Deseas {{ action.verb }} a <strong>{{ selection.name }}</strong> ({{
            selection.displayId
          }})?
        </p>
        <p class="status-warning">
          <template v-if="activating">
            El usuario volverá a poder iniciar sesión con sus credenciales vigentes. Las sesiones y
            los enlaces de recuperación anteriores seguirán invalidados. La activación no renueva
            contraseñas vencidas ni confirma correos pendientes.
          </template>
          <template v-else>
            El usuario perderá el acceso y sus sesiones y enlaces de recuperación quedarán
            invalidados. Seguirá visible en la administración como inactivo. Sus datos y registros
            relacionados se conservarán.
          </template>
        </p>
        <p v-if="error" ref="feedback" class="status-error" role="alert" tabindex="-1">
          {{ error }}
        </p>
        <footer>
          <button type="button" class="secondary" :disabled="saving" @click="close">
            Cancelar
          </button>
          <button type="button" class="primary" :disabled="saving || blocked" @click="confirm">
            {{ saving ? action.pending : action.confirm }}
          </button>
        </footer>
      </template>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-backdrop:has(.user-status-content)::backdrop) {
  background: var(--overlay-background);
}
:global(.app-modal-card:has(.user-status-content)) {
  width: min(640px, 100%);
  max-width: 640px;
  padding: 0;
  border-radius: var(--radius-medium);
  background: var(--dialog-background);
  color: var(--text-primary);
  overflow: hidden;
}
:global(.app-modal-card:has(.user-status-content) .app-modal-title) {
  margin: 0;
  padding: 24px 80px 24px 24px;
  background: var(--primary-color);
  color: var(--content-background);
  text-align: left;
  font-style: normal;
  font-size: 1.25rem;
}
:global(.app-modal-card:has(.user-status-content) .app-modal-close) {
  top: 14px;
  right: 24px;
  color: var(--content-background);
}
.user-status-content {
  padding: 24px;
  overflow-wrap: anywhere;
}
.status-warning {
  padding: 16px;
  border-left: 3px solid var(--primary-color);
  background: var(--content-background);
}
.status-error {
  color: var(--error-color);
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
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  font: inherit;
}
.primary {
  background: var(--button-confirm-background);
  color: var(--button-confirm-text);
  border-color: var(--button-confirm-background);
}
.primary:not(:disabled):hover {
  background: var(--button-confirm-hover-background);
  border-color: var(--button-confirm-hover-background);
}
.secondary {
  background: var(--content-background);
  color: var(--button-secondary-text);
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
@media (max-width: 575px) {
  .user-status-content {
    padding: 20px 16px;
  }
  footer button {
    flex: 1;
  }
}
</style>
