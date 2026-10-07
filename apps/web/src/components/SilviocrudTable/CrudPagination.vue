<script setup lang="ts">
  const props = defineProps<{
    currentPage: number
    totalPages: number
  }>()

  const emit = defineEmits<{
    page: [page: number]
  }>()

  function goToPage(page: number) {
    if (page >= 1 && page <= props.totalPages) {
      emit('page', page)
    }
  }
</script>

<template>
  <div class="join">
    <button class="join-item btn"
      :disabled="currentPage === 1" @click="goToPage(currentPage - 1)"
    >
      Previous
    </button>

    <button class="join-item btn"
      v-for="page in totalPages" :key="page"
      :class="{ active: page === currentPage }" @click="goToPage(page)"
    >
      {{ page }}
    </button>

    <button class="join-item btn"
      :disabled="currentPage === totalPages"
      @click="goToPage(currentPage + 1)"
    >
      Next
    </button>
  </div>
</template>
