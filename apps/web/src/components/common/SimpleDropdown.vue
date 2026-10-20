<script setup lang="ts">
import { useId } from 'vue'

interface DropdownOption {
  id: number
  name: string
}

withDefaults(defineProps<{
  options: DropdownOption[]
  label: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
}>(), {
  placeholder: 'Seleccione una opción',
  disabled: false,
  required: false
})

const selected = defineModel<number | null>({
  default: null
})

const id = useId()
</script>

<template>
  <div class="simple-dropdown">
    <label :for="id">
      {{ label }}
    </label>

    <select
      :id="id"
      v-model="selected"
      class="dropdown-select"
      :disabled="disabled"
      :required="required"
    >
      <option :value="null" disabled>
        {{ placeholder }}
      </option>

      <option
        v-for="option in options"
        :key="option.id"
        :value="option.id"
      >
        {{ option.name }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.simple-dropdown {
  width: 100%;
  min-width: 0;
}

.simple-dropdown label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.dropdown-select {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;

  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);

  background: var(--content-background);
  color: var(--text-primary);

  font: inherit;
  cursor: pointer;
}

/* Purple focus effect */
.dropdown-select:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* Disabled state */
.dropdown-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
