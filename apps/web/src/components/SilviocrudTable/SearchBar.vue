<script setup lang="ts">
import { ref } from 'vue'

const searchText = ref('')

const emit = defineEmits<{
  search: [value: string]
}>()

function handleSearch() {
  emit('search', searchText.value)
}
</script>

<template>
  <div>
    <input  v-model="searchText " type="text"
      placeholder="Search..." @keyup.enter="handleSearch" class="input
        input-bordered bg-white text-black border-gray-300 w-full"
    />
    <button @click="handleSearch">
      Search
    </button>
  </div>
</template>
<style scoped>
.input {
  background: var(--input-background);
  color: var(--text-primary);
  border-color: var(--border-color);
}
button {
  background: var(--button-background);
  color: var(--button-text);
}
button:hover {
  background: var(--button-hover-background);
}
</style>