<script setup lang="ts">
import { onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string; closeDisabled?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()
let opener: HTMLElement | null = null
let restoreScroll: (() => void) | undefined

function requestClose() {
  if (!props.closeDisabled) emit('close')
}

function releasePage() {
  restoreScroll?.()
  restoreScroll = undefined
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  opener = null
}

function lockPage() {
  const { scrollX, scrollY } = window
  const changes: [HTMLElement, string, string][] = [
    [document.documentElement, 'overflow', 'hidden'],
    [document.body, 'position', 'fixed'],
    [document.body, 'top', `-${scrollY}px`],
    [document.body, 'left', `-${scrollX}px`],
    [document.body, 'width', '100%'],
    [document.body, 'overflow', 'hidden'],
  ]
  const previous = changes.map(
    ([element, property]) =>
      [
        element,
        property,
        element.style.getPropertyValue(property),
        element.style.getPropertyPriority(property),
      ] as const,
  )
  for (const [element, property, value] of changes) element.style.setProperty(property, value)
  restoreScroll = () => {
    for (const [element, property, value, priority] of previous) {
      if (value) element.style.setProperty(property, value, priority)
      else element.style.removeProperty(property)
    }
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
    }
  }
}

function syncOpen() {
  const element = dialog.value
  const open = props.open
  if (!element) return
  if (open && !element.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    lockPage()
    const initialFocus =
      element.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      ) ?? element.querySelector<HTMLElement>('button:not([disabled])')
    initialFocus?.focus()
  } else if (!open) {
    if (element.open) element.close()
    releasePage()
  }
}
onMounted(syncOpen)
watch(() => props.open, syncOpen, { flush: 'post' })

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
  releasePage()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="app-modal-backdrop"
      :aria-labelledby="titleId"
      aria-modal="true"
      @cancel.prevent="requestClose"
      @click.self="requestClose"
    >
      <div v-if="open" class="app-modal-card">
        <button
          class="app-modal-close"
          type="button"
          aria-label="Cerrar"
          :disabled="closeDisabled"
          @click="requestClose"
        >
          <i class="bi bi-x-lg"></i>
        </button>
        <h2 :id="titleId" class="app-modal-title">{{ title }}</h2>
        <slot />
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.app-modal-backdrop {
  position: fixed;
  inset: 0;
  margin: 0;
  border: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  background: transparent;
  padding: 1rem;
}
.app-modal-backdrop[open] {
  display: grid;
  place-items: center;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.app-modal-backdrop::backdrop {
  background: var(--overlay-background);
}
.app-modal-card {
  position: relative;
  background: var(--dialog-background);
  color: var(--text-primary);
  width: 100%;
  max-width: 480px;
  padding: 2rem 1.75rem;
  border-radius: 8px;
  max-height: calc(100dvh - 2rem);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.app-modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: 0;
  font-size: 1.25rem;
  width: 44px;
  height: 44px;
  color: var(--text-primary);
}
.app-modal-close:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.app-modal-title {
  text-align: center;
  font-style: italic;
  font-weight: 700;
  font-size: 1.5rem;
  margin-bottom: 1.25rem;
  color: var(--text-primary);
}
</style>
