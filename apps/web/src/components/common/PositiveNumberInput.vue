<script setup lang="ts">
import { computed, ref, useId, watch} from 'vue'

const props = withDefaults(defineProps<{
  label: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  min?: number
  max?: number
}>(), {
  placeholder: '',
  disabled: false,
  required: false,
  min: 1,
})

const value = defineModel<number | null>({
  default: null
})

const emit = defineEmits<{
  'validity-change': [valid: boolean]
}>()

const id = useId()
const touched = ref(false)

const isInvalid = computed(() => {
  if (value.value === null) return false

  return (
    !Number.isInteger(value.value) ||
    value.value < props.min ||
    (props.max !== undefined && value.value > props.max)
  )
})

const isValid = computed(() =>
  !isInvalid.value &&
  (!props.required || value.value !== null)
)

watch(
  isValid,
  (valid) => emit('validity-change', valid),
  { immediate: true },
)

// Display errors after the user interacts with the field
const showError = computed(() =>
  touched.value &&
  (
    isInvalid.value ||
    (props.required && value.value === null)
  )
)

const errorMessage = computed(() => {
  if (value.value === null) {
    return 'Este campo es obligatorio.'
  }

  if (props.max !== undefined) {
    return `Ingrese un número entero entre ${props.min} y ${props.max}.`
  }

  return `Ingrese un número entero mayor o igual que ${props.min}.`
})

function handleInput(event: Event) {
  const input = event.target as HTMLInputElement

  value.value = input.value === ''
    ? null
    : Number(input.value)
}
</script>

<template>
  <div class="number-field">
    <label :for="id">
      {{ label }}
      <span v-if="required">*</span>
    </label>

    <input
      :id="id"
      :value="value ?? ''"
      type="number"
      :min="props.min"
      :max="props.max"
      step="1"
      class="number-input"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :aria-invalid="showError"
      :aria-describedby="showError ? `${id}-error` : undefined"
      @input="handleInput"
      @blur="touched = true"
    />

    <p
      v-if="showError"
      :id="`${id}-error`"
      class="input-error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.number-field {
  width: 100%;
  min-width: 0;
}

.number-field label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.number-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;

  border: 1px solid var(--border-color);
  border-radius: var(--radius-small);

  background: var(--content-background);
  color: var(--text-primary);
  font: inherit;
}

.number-input:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.number-input[aria-invalid="true"] {
  border-color: var(--error-color);
}

.input-error {
  margin: 6px 0 0;
  color: var(--error-color);
  font-size: 0.875rem;
}
</style>
