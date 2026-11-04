<script setup lang="ts">
defineProps<{
  items: { id: string; label: string; icon: string }[]
  selected: string
  disabled?: boolean
  label?: string
}>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <nav class="section-navigation" :aria-label="label || 'Secciones'">
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
@media (max-width: 760px) {
  .section-navigation {
    flex-direction: row;
    overflow-x: auto;
  }
  button {
    flex-shrink: 0;
  }
}
</style>
