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
  <dialog ref="dialog" class="theater-dialog" :aria-labelledby="id + '-title'" @cancel.prevent="requestClose">
    <header class="dialog-heading">
      <h2 :id="id + '-title'">{{ title }}</h2>
      <button type="button" class="close-button" :aria-label="closeLabel" :disabled="closeDisabled" @click="requestClose">
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </header>
    <slot />
  </dialog>
</template>

<style scoped>
.theater-dialog { position: fixed; top: 50%; left: 50%; width: min(calc(100% - 32px), 620px); max-height: min(90dvh, 760px); margin: 0; padding: 0; border: 0; border-radius: var(--radius-medium); color: var(--color-dark); background: var(--color-white); transform: translate(-50%, -50%); }
.theater-dialog::backdrop { background: color-mix(in srgb, var(--color-black) 55%, transparent); }
.dialog-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px 24px; color: var(--color-white); background: var(--color-primary); }
.dialog-heading h2 { margin: 0; font-size: 1.25rem; }
.close-button { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: var(--radius-small); color: inherit; background: transparent; }
</style>
