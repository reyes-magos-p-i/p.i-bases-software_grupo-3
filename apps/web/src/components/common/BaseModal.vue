<script setup lang="ts">
import { onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    closeDisabled?: boolean
    appearance?: 'standard' | 'auth'
  }>(),
  { appearance: 'standard' },
)
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
      <div
        v-if="open"
        class="app-modal-card"
        :class="appearance === 'auth' ? 'app-modal-card--auth' : 'cinema-dialog'"
      >
        <header class="dialog-heading">
          <h2 :id="titleId" class="app-modal-title">{{ title }}</h2>
          <button
            class="app-modal-close"
            type="button"
            aria-label="Cerrar"
            :disabled="closeDisabled"
            @click="requestClose"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </header>
        <div class="app-modal-body"><slot /></div>
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
  padding: 0;
  border-radius: var(--radius-medium);
  max-height: calc(100dvh - 2rem);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: contain;
}
.app-modal-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--dialog-content-padding);
}
.app-modal-card--auth {
  display: block;
  padding: 2rem 1.75rem;
  border-radius: 8px;
  overflow-y: auto;
  --scrollbar-color: var(--scrollbar-thumb);
  --scrollbar-hover-color: var(--scrollbar-thumb-hover);
}
.app-modal-card--auth .dialog-heading {
  position: static;
  display: block;
  padding: 0;
  background: transparent;
}
.app-modal-card--auth .app-modal-title {
  margin: 0 0 1.25rem;
  padding-inline: 1rem;
  color: var(--text-primary);
  text-align: center;
  font-size: 1.5rem;
  font-style: normal;
  font-weight: 700;
}
.app-modal-card--auth .app-modal-close {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: 1.25rem;
}
.app-modal-card--auth .app-modal-close:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}
.app-modal-card--auth .app-modal-body {
  padding: 0;
  overflow: visible;
}
</style>
