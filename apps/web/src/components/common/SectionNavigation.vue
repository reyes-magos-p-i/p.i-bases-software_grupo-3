<script setup lang="ts">
defineProps<{
  items: readonly { id: string; label: string; icon: string }[]
  selected: string
  disabled?: boolean
  label?: string
  appearance?: 'sidebar' | 'menu'
}>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <nav
    class="section-navigation"
    :class="{ 'section-navigation--menu': appearance === 'menu' }"
    :aria-label="label || 'Secciones'"
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      :disabled="disabled"
      :aria-current="selected === item.id ? 'page' : undefined"
      @click="emit('select', item.id)"
    >
      <i :class="['bi', item.icon]" aria-hidden="true"></i>{{ item.label }}
    </button>
  </nav>
</template>

<style scoped>
.section-navigation {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: var(--radius-medium);
  background: var(--sidebar-background);
}
button {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  border: 0;
  border-radius: var(--radius-small);
  text-align: left;
  background: transparent;
  color: var(--sidebar-text);
  min-height: 44px;
  transition: background var(--transition-fast);
}
button:hover {
  background: var(--sidebar-hover-background);
}
button[aria-current] {
  background: var(--sidebar-active-background);
  color: var(--sidebar-active-text);
  font-weight: 700;
}
button:focus-visible {
  outline: 2px solid var(--focus-on-dark);
  outline-offset: 2px;
}
button:disabled {
  opacity: 0.65;
}
.section-navigation--menu {
  gap: 2px;
  padding: 0;
  border-radius: 0;
  background: transparent;
}
.section-navigation--menu button {
  width: 100%;
  padding: 0.65rem 0.75rem;
  color: var(--text-primary);
}
.section-navigation--menu button:hover {
  background: var(--surface-hover);
}
.section-navigation--menu button[aria-current] {
  background: var(--accent-color);
  color: var(--page-background);
}
.section-navigation--menu button:focus-visible {
  outline-color: var(--focus-color);
}
@media (max-width: 760px) {
  .section-navigation:not(.section-navigation--menu) {
    flex-direction: row;
    overflow-x: auto;
  }
  button {
    flex-shrink: 0;
  }
}
</style>
