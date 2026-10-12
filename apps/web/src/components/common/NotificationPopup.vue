<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import successIcon from '@/assets/icons/notification-success.svg'
import warningIcon from '@/assets/icons/notification-warning.svg'
import errorIcon from '@/assets/icons/notification-error.svg'

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
  }>(),
  { type: 'success', title: undefined, duration: 4000 },
)

const emit = defineEmits<{ close: [] }>()

const ICONS: Record<NotificationType, string> = {
  success: successIcon,
  alert: warningIcon,
  error: errorIcon,
}

const heading = computed(() => props.title ?? DEFAULT_TITLES[props.type])
const iconUrl = computed(() => `url("${ICONS[props.type]}")`)
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
    :class="['notification-popup', `notification-popup--${type}`]"
    :role="role"
    :style="{ '--notification-icon-url': iconUrl }"
    :aria-live="type === 'success' ? 'polite' : 'assertive'"
    aria-atomic="true"
    @mouseenter="clearTimer"
    @mouseleave="startTimer"
  >
    <p class="notification-title">
      <span class="notification-icon" aria-hidden="true" />
      <span>{{ heading }}</span>
    </p>
    <p class="notification-message">{{ message }}</p>
  </div>
</template>

<style scoped>
.notification-popup {
  --notification-accent: #2ecc71;
  --notification-icon: #14ae5c;
  box-sizing: border-box;
  width: min(292px, calc(100vw - 2rem));
  padding: 19px 20px 14px;
  border-radius: 16px;
  background: #fff;
  box-shadow:
    9px 8px 25px rgba(0, 0, 0, 0.1),
    34px 31px 46px rgba(0, 0, 0, 0.09);
  color: #4a4a4a;
  text-align: left;
}

.notification-popup--alert {
  --notification-accent: #d97706;
  --notification-icon: #d97706;
}

.notification-popup--error {
  --notification-accent: #dc2626;
  --notification-icon: #dc2626;
}

.notification-title {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  margin: 0;
  color: var(--notification-accent);
  font-size: 16px;
  font-weight: 700;
  line-height: 18px;
}

.notification-icon {
  flex: none;
  width: 18px;
  height: 18px;
  background-color: var(--notification-icon);
  -webkit-mask: var(--notification-icon-url) center / contain no-repeat;
  mask: var(--notification-icon-url) center / contain no-repeat;
}

.notification-message {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 24px;
  overflow-wrap: anywhere;
}
</style>
