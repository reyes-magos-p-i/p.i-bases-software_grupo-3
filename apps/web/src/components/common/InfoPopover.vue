<script setup lang="ts">
import { ref, useId, useTemplateRef } from 'vue'
import FloatingPopover from './FloatingPopover.vue'

withDefaults(defineProps<{ title: string; surface?: 'light' | 'dark' }>(), { surface: 'light' })
const open = ref(false)
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const id = useId()
</script>

<template>
  <span class="info-popover">
    <button
      ref="trigger"
      type="button"
      class="info-trigger"
      :aria-label="title"
      :aria-expanded="open"
      :aria-controls="id"
      aria-haspopup="dialog"
      @click="open = !open"
    >
      <i class="bi bi-exclamation-circle" aria-hidden="true" />
    </button>
    <FloatingPopover
      :id="id"
      :open="open"
      :anchor="trigger"
      :label="title"
      role="dialog"
      :surface="surface"
      @close="open = false"
    >
      <strong class="info-title">{{ title }}</strong>
      <div class="info-content"><slot /></div>
    </FloatingPopover>
  </span>
</template>

<style scoped>
.info-popover {
  display: inline-flex;
  flex-shrink: 0;
}
.info-trigger {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font-size: 1.125rem;
}
.info-trigger:hover {
  background: var(--surface-hover);
}
.info-title {
  display: block;
  margin-bottom: 8px;
}
.info-content :deep(p) {
  margin: 0 0 8px;
}
.info-content :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
