<script setup lang="ts">
import { PROJECTION_STATUS_LABELS, type ProjectionStatus } from '@/types/projection'

defineProps<{ status: ProjectionStatus }>()
</script>

<template>
  <span class="projection-status" :class="`status-${status.toLowerCase()}`">
    {{ PROJECTION_STATUS_LABELS[status] }}
  </span>
</template>

<style scoped>
.projection-status { font-weight: 600; }
.status-cancelled { color: var(--color-error); }
.status-in_progress { color: #b54708; }
.status-inactive, .status-finished { color: var(--color-gray); }
</style>
