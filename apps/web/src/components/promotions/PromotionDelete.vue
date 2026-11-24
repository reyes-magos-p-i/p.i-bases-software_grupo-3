<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { isAxiosError } from 'axios'

import BaseModal from '@/components/common/BaseModal.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { deletePromotion } from '@/services/promotion.service'
import EmailConfirmationField from '@/components/common/EmailConfirmationField.vue'
import { employeeSession } from '@/services/employee-session.service'

const props = defineProps<{
  promotion: {
    id: number
    title: string
  } | null
}>()

const emit = defineEmits<{
  close: []
  deleted: []
  'session-expired': []
  forbidden: []
  'not-found': []
}>()

const deleting = ref(false)
const confirmation = ref<InstanceType<typeof EmailConfirmationField> | null>(null)
const error = ref('')
let version = 0
watch(() => props.promotion?.id, () => {
  version++
  error.value = ''
  deleting.value = false
})
onBeforeUnmount(() => { version++ })

function close() {
  if (deleting.value) return
  error.value = ''
  emit('close')
}

async function confirmDelete() {
  if (!props.promotion || deleting.value) return
  const email = confirmation.value?.validate()
  if (!email) return

  const promotionId = props.promotion.id
  const currentVersion = version

  deleting.value = true
  error.value = ''

  try {
    await deletePromotion(promotionId)

    if (version !== currentVersion) return
    emit('deleted')
    emit('close')
  } catch (failure) {
    if (version !== currentVersion) return
    if (isAxiosError(failure)) {
      const status = failure.response?.status

      if (status === 401) {
        error.value = 'La sesión ha expirado.'
        emit('session-expired')
      } else if (status === 403) {
        error.value = 'No tienes permiso para eliminar esta promoción.'
        emit('forbidden')
      } else if (status === 404) {
        error.value = 'La promoción ya no existe.'
        emit('not-found')
      } else {
        error.value = 'No se pudo eliminar la promoción.'
      }
    } else {
      error.value = 'No se pudo eliminar la promoción.'
    }
  } finally {
    if (version === currentVersion) deleting.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="promotion !== null"
    title="Eliminar promoción"
    :close-disabled="deleting"
    @close="close"
  >
    <div class="promotion-delete-content promotion-form-modal dialog-content">
      <p>
        ¿Estás seguro de que deseas eliminar la promoción
        <strong>{{ promotion?.title }}</strong
        >?
      </p>

      <p class="delete-warning">Esta acción no se puede deshacer.</p>
      <EmailConfirmationField
        v-if="promotion"
        :key="promotion.id"
        ref="confirmation"
        :expected-email="employeeSession.user.value?.email"
        :disabled="deleting"
      />

      <NotificationPopup
        v-if="error"
        type="error"
        :message="error"
        :duration="0"
        placement="bottom-right"
        @close="error = ''"
      />

      <footer class="delete-footer">
        <button type="button" class="secondary" :disabled="deleting" @click="close">
          Cancelar
        </button>

        <button type="button" class="danger" :disabled="deleting || !promotion" @click="confirmDelete">
          {{ deleting ? 'Eliminando...' : 'Eliminar promoción' }}
        </button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
.promotion-delete-content {
  padding: 24px;
  color: var(--text-primary);
}

.delete-warning {
  color: var(--error-color);
  font-weight: 500;
}

.delete-error {
  color: var(--error-color);
  margin-top: 16px;
}

.delete-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.delete-footer button {
  min-height: 44px;
  padding: 10px 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  font: inherit;
  cursor: pointer;
}

.secondary {
  background: var(--content-background);
  color: var(--button-secondary-text);
}

.secondary:hover:not(:disabled) {
  background: var(--surface-hover);
}

.danger {
  background: var(--error-color);
  border-color: var(--error-color) !important;
  color: var(--text-on-dark);
}

.danger:hover:not(:disabled) {
  filter: brightness(0.9);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
</style>
