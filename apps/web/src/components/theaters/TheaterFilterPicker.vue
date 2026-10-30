<script setup lang="ts">
defineProps<{
  label: string
  legend: string
  allLabel: string
  options: string[]
  name: string
}>()
const selected = defineModel<string[]>({ required: true })
</script>

<template>
  <details class="filter-picker">
    <summary>
      {{ label }}
      <span>{{ selected.length ? `${selected.length}/${options.length}` : allLabel }}</span>
    </summary>
    <fieldset class="checkbox-options">
      <legend class="visually-hidden">{{ legend }}</legend>
      <label v-for="option in options" :key="option">
        <input v-model="selected" type="checkbox" :name="name" :value="option" />{{ option }}
      </label>
    </fieldset>
  </details>
</template>

<style scoped>
.filter-picker {
  position: relative;
  flex: 1;
  min-width: 190px;
  align-self: end;
}
.filter-picker summary {
  box-sizing: border-box;
  height: 44px;
  line-height: 20px;
  padding: 11px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}
.filter-picker summary span {
  margin-left: 8px;
  color: var(--text-secondary);
  font-weight: 400;
}
.filter-picker summary:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.checkbox-options {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 2;
  min-width: 190px;
  max-height: 260px;
  overflow-y: auto;
  margin: 0;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  box-shadow: 0 4px 12px var(--shadow-color);
  color: var(--text-primary);
}
.filter-picker[open] .checkbox-options {
  animation: filter-open 160ms ease-out;
}
@keyframes filter-open {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .filter-picker[open] .checkbox-options {
    animation: none;
  }
}
.checkbox-options label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px;
  font-size: 0.875rem;
  cursor: pointer;
}
.checkbox-options input {
  width: 18px;
  min-height: 18px;
  height: 18px;
  padding: 0;
  flex-shrink: 0;
  accent-color: var(--primary-color);
}
</style>
