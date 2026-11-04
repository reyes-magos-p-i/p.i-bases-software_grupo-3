<script setup lang="ts" generic="T extends string | number">
import { computed, ref, useId } from 'vue'
import { useBlurValidation } from '@/composables/useBlurValidation'
import { displayText } from '@/utils/display-text'

interface DropdownOption {
  id: T
  name: string
}

const props = withDefaults(
  defineProps<{
    options: DropdownOption[]
    label: string
    placeholder?: string
    disabled?: boolean
    required?: boolean
    error?: string
  }>(),
  {
    placeholder: 'Seleccione una opción',
    disabled: false,
    required: false,
    error: '',
  },
)

const selected = defineModel<T | null>({
  default: null,
})

const id = useId()
const touched = ref(false)
const shouldValidate = useBlurValidation()
const feedback = computed(
  () =>
    props.error ||
    (touched.value && props.required && selected.value === null ? 'Selecciona una opción.' : ''),
)
</script>
<template>
  <div class="simple-dropdown">
    <label :for="id">
      {{ label }}
      <span v-if="required" aria-hidden="true"> *</span>
    </label>

    <select
      :id="id"
      v-model="selected"
      class="dropdown-select"
      :disabled="disabled"
      :required="required"
      :aria-invalid="!!feedback"
      :aria-describedby="feedback ? `${id}-error` : undefined"
      @blur="shouldValidate($event) && (touched = true)"
    >
      <option :value="null">
        {{ placeholder }}
      </option>

      <option v-for="option in options" :key="option.id" :value="option.id">
        {{ displayText(option.name) }}
      </option>
    </select>
    <p v-if="feedback" :id="`${id}-error`" class="input-error" role="alert">{{ feedback }}</p>
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
.input-error {
  margin: 6px 0 0;
  color: var(--error-color);
  font-size: 0.875rem;
}
</style>
