<script setup lang="ts">
import { useId, useTemplateRef } from 'vue'

const props = defineProps<{ title: string; closeDisabled?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const id = useId()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
let opener: HTMLElement | null = null

function requestClose() {
  if (!props.closeDisabled) emit('close')
}

function open() {
  if (!dialog.value || dialog.value.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value.showModal()
  dialog.value
    .querySelector<HTMLElement>('select:not([disabled]), input:not([disabled]), .close-button')
    ?.focus()
}

function close() {
  dialog.value?.close()
  if (opener?.isConnected) opener.focus()
  opener = null
}

defineExpose({ open, close, element: dialog })
</script>

<template>
  <dialog
    ref="dialog"
    class="projection-dialog cinema-dialog"
    :aria-labelledby="id + '-title'"
    @cancel.prevent="requestClose"
  >
    <header class="dialog-heading">
      <h2 :id="id + '-title'">{{ title }}</h2>
      <button
        type="button"
        class="close-button"
        aria-label="Cerrar"
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
.projection-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(calc(100% - 32px), 1200px);
  max-height: calc(100dvh - 32px);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-medium);
  color: var(--text-primary);
  background: var(--dialog-background);
  transform: translate(-50%, -50%);
  overflow: hidden;
}
.projection-dialog[open] {
  display: flex;
  flex-direction: column;
}
.projection-dialog::backdrop {
  background: var(--overlay-background);
}
</style>
