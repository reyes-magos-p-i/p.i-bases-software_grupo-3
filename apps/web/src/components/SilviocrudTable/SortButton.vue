<script setup lang="ts">
const props = defineProps<{
  column: string
  label: string
  direction: 'asc' | 'desc' | null
}>()

const emit = defineEmits<{
  sort: [column: string, direction: 'asc' | 'desc']
}>()

function handleClick() {
  const newDirection = props.direction === 'asc' ? 'desc' : 'asc'

  emit('sort', props.column, newDirection)
}
</script>

<template>
  <button class="btn w-full" @click="handleClick">
    {{ label }}

    <span v-if="direction === 'asc'">↑</span>
    <span v-else-if="direction === 'desc'">↓</span>
    <span v-else>↕</span>
  </button>
</template>
