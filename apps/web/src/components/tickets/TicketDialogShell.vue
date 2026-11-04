<script setup lang="ts">
import { onBeforeUnmount, useId, useTemplateRef } from 'vue'

const props = withDefaults(
  defineProps<{ title: string; closeDisabled?: boolean; closeLabel?: string }>(),
  { closeDisabled: false, closeLabel: 'Cerrar formulario' },
)
const emit = defineEmits<{ close: [] }>()
const id = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let opener: HTMLElement | null = null

function open() {
  const element = dialog.value
  if (!element || element.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  element.showModal()
  const target =
    element.querySelector<HTMLElement>('form input, form select') ??
    element.querySelector<HTMLElement>('button:not([disabled])')
  target?.focus()
}

function close() {
  if (!dialog.value?.open) return
  dialog.value.close()
  if (opener?.isConnected) opener.focus()
  opener = null
}

function requestClose() {
  if (props.closeDisabled) return
  close()
  emit('close')
}

onBeforeUnmount(close)

defineExpose({ open, close })
</script>

<template>
  <dialog
    ref="dialog"
    class="ticket-dialog cinema-dialog"
    :aria-labelledby="id + '-title'"
    @cancel.prevent="requestClose"
  >
    <header class="dialog-heading">
      <h2 :id="id + '-title'">{{ title }}</h2>
      <button
        type="button"
        class="close-button"
        :aria-label="closeLabel"
        :disabled="closeDisabled"
        @click="requestClose"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>
    <slot />
  </dialog>
</template>

<style scoped>
.ticket-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(calc(100% - 32px), 604px);
  max-height: min(90dvh, 760px);
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 0;
  color: var(--text-primary);
  background: var(--dialog-background);
  transform: translate(-50%, -50%);
}
.ticket-dialog::backdrop {
  background: color-mix(in srgb, var(--page-background) 55%, transparent);
}
</style>
