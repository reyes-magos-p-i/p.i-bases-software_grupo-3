<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  limit: number
  placeholder?: string
  disabled?: boolean
  required?: boolean
  multiline?: boolean
  rows?: number
}>(), {
  placeholder: '',
  disabled: false,
  required: false,
  multiline: false,
  rows: 4
})

const value = defineModel<string>({
  default: ''
})

const id = useId()

const characterCount = computed(() => value.value.length)

const isInvalid = computed(() =>
  characterCount.value > props.limit
)

</script>

<template>
  <div class="limited-input">

    <label :for="id">
      {{ label }}
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
      :aria-invalid="isInvalid"
      :aria-describedby="`${id}-count`"
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
      :aria-invalid="isInvalid"
      :aria-describedby="`${id}-count`"
    />

    <!-- Validation and counter -->
    <div class="input-information">

      <span
        v-if="isInvalid"
        class="input-error"
        role="alert"
      >
        Se ha superado el límite de caracteres.
      </span>

      <span
        :id="`${id}-count`"
        class="character-counter"
        :class="{ 'input-error': isInvalid }"
      >
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
.text-input[aria-invalid="true"] {
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
