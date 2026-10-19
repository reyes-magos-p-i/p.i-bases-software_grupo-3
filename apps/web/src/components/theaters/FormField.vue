<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{ label: string; required?: boolean; error?: string }>()
const id = useId()
const errorId = computed(() => (props.error ? `${id}-error` : undefined))
</script>

<template>
  <div class="form-field">
    <label :for="id">
      {{ label }}<template v-if="required"> <span class="required-marker">*</span></template>
    </label>
    <slot :id="id" :invalid="!!error" :describedby="errorId" />
    <small v-if="error" :id="errorId" class="field-error">{{ error }}</small>
  </div>
</template>

<style scoped>
.form-field { display: grid; gap: 8px; }
.required-marker { color: var(--color-error); font-weight: 700; }
.field-error { margin-bottom: 4px; color: var(--color-error); }
</style>
