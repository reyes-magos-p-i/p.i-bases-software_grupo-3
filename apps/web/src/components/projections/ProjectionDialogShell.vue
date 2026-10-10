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
    class="projection-dialog"
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
  max-height: 94dvh;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-medium);
  color: var(--text-primary);
  background: var(--content-background);
  transform: translate(-50%, -50%);
  overflow: hidden;
}
.projection-dialog[open] {
  display: flex;
  flex-direction: column;
}
.projection-dialog::backdrop {
  background: color-mix(in srgb, var(--page-background) 55%, transparent);
}
.dialog-heading {
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px 32px;
  color: var(--text-on-dark);
  background: var(--primary-color);
}
.dialog-heading h2 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
}
.close-button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius-small);
  font-size: 1.5rem;
  color: inherit;
  background: transparent;
}
.close-button:focus-visible {
  outline: 2px solid var(--focus-on-dark);
  outline-offset: 2px;
}
@media (max-width: 640px) {
  .dialog-heading {
    padding: 16px;
  }
}
</style>
