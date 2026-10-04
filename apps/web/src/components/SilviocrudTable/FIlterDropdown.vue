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

<template>
  <select
    class="select select-bordered bg-white text-black border-gray-300 w-full"
    @change="handleChange"
  >
    <option value="">All</option>

```
<option
  v-for="option in options"
  :key="option"
  :value="option"
>
  {{ option }}
</option>
```

  </select>
</template>
