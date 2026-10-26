<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'

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

const STYLES: Record<NotificationType, { icon: string; color: string }> = {
  success: { icon: 'bi-check-circle-fill', color: 'text-success' },
  alert: { icon: 'bi-exclamation-triangle-fill', color: 'text-warning-emphasis' },
  error: { icon: 'bi-x-circle-fill', color: 'text-danger' },
}

const heading = computed(() => props.title ?? DEFAULT_TITLES[props.type])
const style = computed(() => STYLES[props.type])
const role = computed(() => (props.type === 'success' ? 'status' : 'alert'))

let timer: ReturnType<typeof setTimeout> | undefined

function clearTimer() {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

function startTimer() {
  clearTimer()
  if (props.duration > 0) timer = setTimeout(() => emit('close'), props.duration)
}

onMounted(startTimer)
onBeforeUnmount(clearTimer)
watch(() => [props.message, props.type, props.duration], startTimer)
</script>

<template>
  <div
    :class="[
      'notification-popup',
      `notification-popup--${type}`,
      { 'notification-popup--floating': placement === 'bottom-right' },
      'bg-white',
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
    @mouseenter="clearTimer"
    @mouseleave="startTimer"
  >
    <p :class="['d-flex', 'align-items-center', 'gap-1', 'mb-0', 'fw-bold', style.color]">
      <i :class="['bi', style.icon]" aria-hidden="true" />
      <span>{{ heading }}</span>
    </p>
    <p class="mb-0 fw-medium text-body-secondary notification-message">{{ message }}</p>
  </div>
</template>

<style scoped>
.notification-popup {
  box-sizing: border-box;
  width: min(292px, calc(100vw - 2rem));
}

.notification-message {
  overflow-wrap: anywhere;
}

.notification-popup--floating {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 1080;
}
</style>
