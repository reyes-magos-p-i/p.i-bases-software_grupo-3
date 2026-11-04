<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useBlurValidation } from '@/composables/useBlurValidation'
import { characterCount as countCharacters } from '@/utils/user-validation'

const props = withDefaults(
  defineProps<{
    label: string
    limit: number
    placeholder?: string
    disabled?: boolean
    required?: boolean
    multiline?: boolean
    rows?: number
    error?: string
  }>(),
  {
    placeholder: '',
    disabled: false,
    required: false,
    multiline: false,
    rows: 4,
    error: '',
  },
)

const value = defineModel<string>({
  default: '',
})

const id = useId()
const touched = ref(false)
const shouldValidate = useBlurValidation()

const characterCount = computed(() => countCharacters(value.value))

const isInvalid = computed(() => characterCount.value > props.limit)
const feedback = computed(
  () =>
    props.error ||
    (touched.value
      ? !value.value.trim() && props.required
        ? 'Este campo es obligatorio.'
        : isInvalid.value
          ? `Escribe como máximo ${props.limit} ${props.limit === 1 ? 'carácter' : 'caracteres'}.`
          : ''
      : ''),
)

function blur(event: FocusEvent) {
  if (shouldValidate(event)) touched.value = true
}
</script>

<template>
  <div class="limited-input">
    <label :for="id">
      {{ label }}
      <span v-if="required" aria-hidden="true"> *</span>
    </label>

    <!-- Multiline input -->
    <textarea
      v-if="multiline"
      :id="id"
      v-model="value"
      class="text-input"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :aria-invalid="!!feedback"
      :aria-describedby="id + '-count' + (feedback ? ' ' + id + '-error' : '')"
      @blur="blur"
    ></textarea>

    <!-- Single-line input -->
    <input
      v-else
      :id="id"
      v-model="value"
      type="text"
      class="text-input"
      :placeholder="placeholder"
      :disabled="disabled"
      :required="required"
      :aria-invalid="!!feedback"
      :aria-describedby="id + '-count' + (feedback ? ' ' + id + '-error' : '')"
      @blur="blur"
    />

    <!-- Validation and counter -->
    <div class="input-information">
      <span v-if="feedback" :id="`${id}-error`" class="input-error" role="alert">
        {{ feedback }}
      </span>

      <span :id="`${id}-count`" class="character-counter" :class="{ 'input-error': !!feedback }">
        {{ characterCount }} / {{ limit }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.limited-input {
  width: 100%;
  min-width: 0;
}

.limited-input label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}

.text-input {
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

/* Textarea-specific styling */
textarea.text-input {
  resize: vertical;
}

/* Focus effect */
.text-input:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

/* Invalid input */
.text-input[aria-invalid='true'] {
  border-color: var(--error-color);
}

/* Character counter */
.input-information {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.character-counter {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.input-error {
  color: var(--error-color);
  font-size: 0.875rem;
}
</style>
