<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    page: number
    totalPages: number
    disabled?: boolean
    label?: string
  }>(),
  { disabled: false, label: 'Paginación' },
)
const emit = defineEmits<{ change: [page: number] }>()
function change(page: number) {
  if (!props.disabled && page >= 1 && page <= props.totalPages && page !== props.page)
    emit('change', page)
}
</script>

<template>
  <nav class="pagination-controls" :aria-label="label">
    <button
      type="button"
      aria-label="Página anterior"
      title="Página anterior"
      :disabled="disabled || page <= 1 || !totalPages"
      @click="change(page - 1)"
    >
      <i class="bi bi-chevron-left" aria-hidden="true" />
    </button>
    <span aria-current="page" aria-live="polite"
      >Página {{ totalPages ? page : 0 }} de {{ totalPages }}</span
    >
    <button
      type="button"
      aria-label="Página siguiente"
      title="Página siguiente"
      :disabled="disabled || page >= totalPages"
      @click="change(page + 1)"
    >
      <i class="bi bi-chevron-right" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.pagination-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  color: inherit;
  font-size: 0.875rem;
}
button {
  display: inline-grid;
  place-items: center;
  flex: 0 0 44px;
  width: 44px;
  min-height: 44px;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  color: var(--text-primary);
  background: var(--content-background);
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: var(--surface-hover);
}
button:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 3px;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
