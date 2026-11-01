<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { formatBranchId } from '@/services/branch.service'
import type { BranchListItem } from '@/types/branch'

const props = withDefaults(
  defineProps<{
    branch: BranchListItem | null
    saving?: boolean
    error?: string
    /** Set when retrying cannot help, e.g. the branch was already deactivated. */
    blocked?: boolean
  }>(),
  { saving: false, error: '', blocked: false },
)
const emit = defineEmits<{ close: []; confirm: [] }>()
const feedback = useTemplateRef<HTMLElement>('feedback')
const label = computed(() =>
  props.branch ? (props.branch.name ?? formatBranchId(props.branch.id)) : '',
)

watch(
  () => props.error,
  async (error) => {
    if (!error) return
    await nextTick()
    feedback.value?.focus()
  },
)

function close() {
  if (!props.saving) emit('close')
}
</script>

<template>
  <BaseModal
    :open="branch !== null"
    title="Desactivar sucursal"
    :close-disabled="saving"
    @close="close"
  >
    <div v-if="branch" class="branch-deactivation-content" :aria-busy="saving">
      <p class="question">¿Está seguro de que desea desactivar la sucursal {{ label }}?</p>
      <p v-if="branch.companyName" class="company">Compañía: {{ branch.companyName }}</p>
      <p class="deactivation-warning">
        <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
        <span
          ><strong>Esta acción es irreversible.</strong> La sucursal dejará de mostrarse en el
          listado y no podrá volver a activarse.</span
        >
      </p>
      <p v-if="error" ref="feedback" class="deactivation-error" role="alert" tabindex="-1">
        {{ error }}
      </p>
      <footer>
        <button type="button" class="secondary" :disabled="saving" @click="close">Cancelar</button>
        <button
          type="button"
          class="primary"
          :disabled="saving || blocked"
          @click="emit('confirm')"
        >
          {{ saving ? 'Desactivando…' : 'Confirmar' }}
        </button>
      </footer>
    </div>
  </BaseModal>
</template>

<style scoped>
:global(.app-modal-card:has(.branch-deactivation-content)) {
  width: min(640px, 100%);
  max-width: 640px;
}
.branch-deactivation-content {
  padding: 8px 0 0;
}
.question {
  margin: 0 0 8px;
  font-size: 1.05rem;
}
.company {
  margin: 0 0 16px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.deactivation-warning {
  display: flex;
  gap: 10px;
  margin: 0;
  padding: 14px 16px;
  border-left: 3px solid var(--primary-color);
  border-radius: var(--radius-small);
  background: var(--warning-background);
  color: var(--warning-text);
}
.deactivation-error {
  margin: 16px 0 0;
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
  min-height: 42px;
  padding: 9px 16px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  font: inherit;
}
.primary {
  color: var(--text-on-dark);
  background: var(--primary-color);
}
.secondary {
  color: var(--text-primary);
  background: var(--content-background);
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
@media (max-width: 575px) {
  footer button {
    flex: 1;
  }
}
</style>
