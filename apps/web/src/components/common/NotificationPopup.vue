<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

export type NotificationType = 'success' | 'alert' | 'error'

const DEFAULT_TITLES: Record<NotificationType, string> = {
  success: 'ÉXITO',
  alert: 'ADVERTENCIA',
  error: 'ERROR',
}

const props = withDefaults(
  defineProps<{
    type?: NotificationType
    message: string
    title?: string
    /** Milliseconds before emitting `close`. Use 0 to keep the popup until dismissed. */
    duration?: number
    placement?: 'inline' | 'bottom-right'
  }>(),
  { type: 'success', title: undefined, duration: 4000, placement: 'inline' },
)

const emit = defineEmits<{ close: [] }>()
const popup = useTemplateRef<HTMLElement>('popup')
const visible = ref(true)

const ICONS: Record<NotificationType, string> = {
  success: 'bi-check-circle-fill',
  alert: 'bi-exclamation-triangle-fill',
  error: 'bi-x-circle-fill',
}

const heading = computed(() => props.title ?? DEFAULT_TITLES[props.type])
const icon = computed(() => ICONS[props.type])
const role = computed(() => (props.type === 'success' ? 'status' : 'alert'))

let timer: ReturnType<typeof setTimeout> | undefined
let hovered = false
let focused = false

function clearTimer() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function startTimer() {
  clearTimer()
  if (props.duration > 0 && !hovered && !focused) {
    timer = setTimeout(dismiss, props.duration)
  }
}
function dismiss() {
  clearTimer()
  if (props.placement === 'bottom-right') visible.value = false
  emit('close')
}

function hover(value: boolean) {
  hovered = value
  startTimer()
}

function focus(event: FocusEvent) {
  focused =
    event.type === 'focusin' ||
    (event.relatedTarget instanceof Node &&
      (event.currentTarget as HTMLElement).contains(event.relatedTarget))
  startTimer()
}

function floatAboveDialogs() {
  const element = popup.value
  if (props.placement !== 'bottom-right' || !element?.isConnected || !element.showPopover) return
  // The top layer keeps notifications visible inside transformed native dialogs.
  element.showPopover()
}
onMounted(() => {
  startTimer()
  floatAboveDialogs()
})
onBeforeUnmount(clearTimer)
watch(
  () => [props.message, props.type, props.duration, props.placement],
  () => {
    visible.value = true
    startTimer()
  },
)
watch(() => [props.placement, visible.value], floatAboveDialogs, { flush: 'post' })
</script>

<template>
  <div
    v-if="visible"
    ref="popup"
    :popover="placement === 'bottom-right' ? 'manual' : undefined"
    :class="[
      'notification-popup',
      `notification-popup--${type}`,
      { 'notification-popup--floating': placement === 'bottom-right' },
      'rounded-4',
      'shadow',
      'px-3',
      'pt-3',
      'pb-2',
      'text-start',
    ]"
    :role="role"
    :aria-live="type === 'success' ? 'polite' : 'assertive'"
    aria-atomic="true"
    @mouseenter="hover(true)"
    @mouseleave="hover(false)"
    @focusin="focus"
    @focusout="focus"
    @click="dismiss"
  >
    <button
      v-if="placement === 'bottom-right'"
      type="button"
      class="notification-close"
      aria-label="Cerrar notificación"
      @click.stop="dismiss"
    >
      <i class="bi bi-x-lg" aria-hidden="true" />
    </button>
    <p class="notification-heading d-flex align-items-center gap-1 mb-0 fw-bold">
      <i :class="['bi', icon]" aria-hidden="true" />
      <span>{{ heading }}</span>
    </p>
    <p class="mb-0 fw-medium notification-message">{{ message }}</p>
  </div>
</template>

<style scoped>
.notification-popup {
  position: relative;
  box-sizing: border-box;
  width: min(292px, calc(100vw - 2rem));
  color: var(--text-primary);
  background: var(--content-background);
  border: 1px solid var(--border-color);
}

.notification-heading {
  color: var(--warning-text);
}
.notification-popup--error .notification-heading {
  color: var(--error-text);
}
.notification-popup--success .notification-heading {
  color: var(--success-text);
}
.notification-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-small);
  color: var(--text-secondary);
  background: transparent;
}

.notification-message {
  overflow-wrap: anywhere;
  color: var(--text-secondary);
}

.notification-popup--floating {
  padding-right: 3rem !important;
  position: fixed;
  inset: auto max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) auto;
  margin: 0;
  z-index: 1080;
}
</style>
