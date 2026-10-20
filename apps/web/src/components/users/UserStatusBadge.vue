<script setup lang="ts">
import type { UserStatus } from '@/types/user'

defineProps<{ status: UserStatus }>()
</script>

<template>
  <span class="user-status-badge" :class="{ active: status === 'ACTIVE' }">
    {{ status === 'ACTIVE' ? 'Activo' : 'Inactivo' }}
  </span>
</template>

<style scoped>
.user-status-badge {
  color: var(--text-secondary);
  white-space: nowrap;
}
.active {
  color: var(--success-text);
}
</style>
