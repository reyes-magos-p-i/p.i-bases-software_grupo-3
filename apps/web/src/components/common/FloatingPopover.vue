<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    anchor: Element | null
    id: string
    label: string
    role?: 'tooltip' | 'dialog'
    surface?: 'light' | 'dark'
  }>(),
  { role: 'tooltip', surface: 'light' },
)
const emit = defineEmits<{ close: [] }>()
const panel = useTemplateRef<HTMLElement>('panel')
const position = ref({ left: '0px', top: '0px' })
const floating = typeof HTMLElement.prototype.showPopover === 'function'
let shown: HTMLElement | null = null

function place() {
  if (!props.open || !props.anchor || !panel.value) return
  const anchor = props.anchor.getBoundingClientRect()
  const width = document.documentElement.clientWidth || window.innerWidth
  const height = document.documentElement.clientHeight || window.innerHeight
  const left = anchor.left + (anchor.width - panel.value.offsetWidth) / 2
  const above = anchor.top - panel.value.offsetHeight - 8
  const top = above >= 8 ? above : anchor.bottom + 8
  position.value = {
    left: `${Math.max(8, Math.min(left, width - panel.value.offsetWidth - 8))}px`,
    top: `${Math.max(8, Math.min(top, height - panel.value.offsetHeight - 8))}px`,
  }
}
function hide() {
  if (shown?.isConnected) shown.hidePopover?.()
  shown = null
}
async function sync() {
  if (!props.open) {
    hide()
    return
  }
  await nextTick()
  if (!props.open || !panel.value) return
  if (shown !== panel.value) {
    panel.value.showPopover?.()
    shown = panel.value
    if (props.role === 'dialog') panel.value.focus({ preventScroll: true })
  }
  place()
}
function outside(event: PointerEvent) {
  if (
    props.open &&
    event.target instanceof Node &&
    !panel.value?.contains(event.target) &&
    !props.anchor?.contains(event.target)
  )
    emit('close')
}
function escape(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
  if (props.anchor instanceof HTMLElement || props.anchor instanceof SVGElement)
    props.anchor.focus({ preventScroll: true })
}
function scroll(event: Event) {
  if (props.open && event.target instanceof Node && !panel.value?.contains(event.target))
    emit('close')
}
watch(() => [props.open, props.anchor], sync)
onMounted(() => {
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('keydown', escape, true)
  document.addEventListener('scroll', scroll, true)
  window.addEventListener('resize', place)
  void sync()
})
onBeforeUnmount(() => {
  hide()
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('keydown', escape, true)
  document.removeEventListener('scroll', scroll, true)
  window.removeEventListener('resize', place)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      :id="id"
      ref="panel"
      class="floating-popover"
      :class="{ 'surface-theme--dark': surface === 'dark' }"
      :popover="floating ? 'manual' : undefined"
      :role="role"
      :aria-label="label"
      :tabindex="role === 'dialog' ? -1 : undefined"
      :style="position"
    >
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.floating-popover {
  position: fixed;
  inset: auto;
  z-index: 2000;
  width: max-content;
  max-width: min(360px, calc(100vw - 16px));
  max-height: calc(100dvh - 16px);
  overflow: auto;
  overscroll-behavior: contain;
  margin: 0;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--dialog-background);
  color: var(--text-primary);
  box-shadow: 0 8px 24px var(--shadow-strong-color);
  font-size: 0.875rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
</style>
