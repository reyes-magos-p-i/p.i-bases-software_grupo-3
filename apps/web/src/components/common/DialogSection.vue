<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    title: string
    number?: number
    as?: 'section' | 'fieldset'
  }>(),
  { as: 'section' },
)
const titleId = useId()
</script>

<template>
  <component :is="as" class="dialog-section" :aria-labelledby="titleId">
    <component :is="as === 'fieldset' ? 'legend' : 'h3'" :id="titleId" class="dialog-section-title">
      <span v-if="number !== undefined" class="dialog-section-number" aria-hidden="true">{{
        number
      }}</span>
      {{ title }}
    </component>
    <slot />
  </component>
</template>

<style scoped>
.dialog-section {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}
.dialog-section-title {
  display: flex;
  float: none;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0 0 16px;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 1rem;
  font-style: normal;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.dialog-section-number {
  display: grid;
  flex: 0 0 var(--dialog-section-number-size);
  place-items: center;
  height: var(--dialog-section-number-size);
  border-radius: 50%;
  color: var(--text-on-dark);
  background: var(--primary-color);
  font-size: 0.85rem;
}
</style>
