<script setup lang="ts">
import { computed } from 'vue'
import ReusableSearchDropdown from '@/components/common/ReusableSearchDropdown.vue'
import type { MovieOption } from '@/types/movie'

// Branches where the movie is available (CINEMA_MOVIES): only those can schedule projections
// and show the movie in the portal.
const branchIds = defineModel<number[]>({ required: true })
const props = defineProps<{
  branches: readonly MovieOption[]
  error?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'clear-error': [] }>()

const options = computed(() =>
  props.branches.map((branch) => ({ value: branch.id, label: branch.name })),
)
const allSelected = computed(
  () =>
    props.branches.length > 0 &&
    props.branches.every((branch) => branchIds.value.includes(branch.id)),
)

function selectAll() {
  branchIds.value = props.branches.map((branch) => branch.id)
  emit('clear-error')
}
</script>

<template>
  <div class="branches-field">
    <ReusableSearchDropdown
      v-model="branchIds"
      label="Sucursales"
      placeholder="Buscar sucursales..."
      :options="options"
      :min-search-length="0"
      :disabled="disabled"
      :error="error"
      @update:model-value="emit('clear-error')"
    />
    <div class="branches-actions">
      <small class="field-hint">
        Opcional. Solo las sucursales seleccionadas pueden programar funciones de esta película y
        mostrarla en el portal.
      </small>
      <button
        type="button"
        class="select-all"
        :disabled="disabled || allSelected || !branches.length"
        @click="selectAll"
      >
        Seleccionar todas
      </button>
    </div>
  </div>
</template>

<style scoped>
.branches-field {
  display: grid;
  gap: 6px;
}

.branches-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.field-hint {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.select-all {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--primary-color);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

.select-all:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.select-all:disabled {
  color: var(--text-secondary);
  text-decoration: none;
  cursor: not-allowed;
}
</style>
