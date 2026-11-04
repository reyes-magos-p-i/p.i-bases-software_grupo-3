<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import TheaterFilterPicker from './TheaterFilterPicker.vue'
import type { TheaterSortKey } from '@/composables/useTheaterFilters'

defineProps<{
  cinemaOptions: string[]
  projectorOptions: string[]
  statusOptions: string[]
  hasFilters: boolean
}>()
defineEmits<{ clear: [] }>()
const cinemas = defineModel<string[]>('cinemas', { required: true })
const projectors = defineModel<string[]>('projectors', { required: true })
const statuses = defineModel<string[]>('statuses', { required: true })
const sortBy = defineModel<TheaterSortKey>('sortBy', { required: true })
const sortDirection = defineModel<'asc' | 'desc'>('sortDirection', { required: true })
const container = useTemplateRef<HTMLElement>('container')

function closePickers(event: PointerEvent | KeyboardEvent) {
  if ('key' in event && event.key !== 'Escape') return
  if (!container.value) return
  for (const picker of container.value.querySelectorAll<HTMLDetailsElement>('details[open]')) {
    if (
      event.type === 'pointerdown' &&
      event.target instanceof Node &&
      picker.contains(event.target)
    )
      continue
    picker.open = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', closePickers)
  document.addEventListener('keydown', closePickers)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closePickers)
  document.removeEventListener('keydown', closePickers)
})
</script>

<template>
  <div ref="container" class="filters">
    <TheaterFilterPicker
      v-model="cinemas"
      label="Sucursal"
      legend="Filtrar por sucursales"
      all-label="Todas"
      name="cinema"
      :options="cinemaOptions"
    />
    <TheaterFilterPicker
      v-model="projectors"
      label="Proyector"
      legend="Filtrar por proyectores"
      all-label="Todos"
      name="projector"
      :options="projectorOptions"
    />
    <TheaterFilterPicker
      v-model="statuses"
      label="Estado"
      legend="Filtrar por estados"
      all-label="Todos"
      name="status"
      :options="statusOptions"
    />
    <label
      ><span class="visually-hidden">Ordenar por</span>
      <select v-model="sortBy" name="sortBy">
        <option value="theaterId">Ordenar por: ID</option>
        <option value="cinema">Ordenar por: Sucursal</option>
        <option value="numberOfSeats">Ordenar por: Asientos</option>
        <option value="dimensions">Ordenar por: Dimensiones</option>
        <option value="projectorName">Ordenar por: Proyector</option>
        <option value="status">Ordenar por: Estado</option>
      </select>
    </label>
    <label
      ><span class="visually-hidden">Orden</span>
      <select v-model="sortDirection" name="sortDirection">
        <option value="asc">Orden: Ascendente</option>
        <option value="desc">Orden: Descendente</option>
      </select>
    </label>
    <button type="button" class="secondary-button" :disabled="!hasFilters" @click="$emit('clear')">
      <i class="bi bi-x-circle" aria-hidden="true"></i> Limpiar filtros
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin-bottom: 20px;
}
label {
  display: grid;
  flex: 1;
  min-width: 150px;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 600;
}
select {
  box-sizing: border-box;
  height: var(--filter-control-height);
  min-height: var(--filter-control-height);
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--text-primary);
  padding: 11px 12px;
  font: inherit;
}
.secondary-button {
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--primary-color);
  border-radius: var(--radius-small);
  background: var(--content-background);
  color: var(--button-secondary-text);
  font: inherit;
  cursor: pointer;
}
.secondary-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.secondary-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
@media (max-width: 600px) {
  .secondary-button {
    flex: 1;
  }
}
</style>
