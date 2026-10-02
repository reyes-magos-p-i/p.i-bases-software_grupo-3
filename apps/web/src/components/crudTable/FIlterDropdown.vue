<script setup lang="ts">
const props = defineProps<{
  column: string
  options: string[]
}>()

const emit = defineEmits<{
  filter: [column: string, value: string]
}>()

function handleChange(event: Event) {
  const target = event.target as HTMLSelectElement

  emit('filter', props.column, target.value)
}
</script>
// cambiar para que funcione con Daisy ui
<template>
  <div class="dropdown">
  <select @change="handleChange">
    <option value="">All</option>

    <option
      v-for="option in options"
      :key="option"
      :value="option"
    >
      {{ option }}
    </option>
  </select>
  </div>
</template>
