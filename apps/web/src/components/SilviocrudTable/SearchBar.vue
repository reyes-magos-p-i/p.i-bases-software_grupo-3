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
