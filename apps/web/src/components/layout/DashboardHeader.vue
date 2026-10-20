<script setup lang="ts">
import { computed } from 'vue'
import defaultProfileImage from '@/assets/profile/profile-circle-svgrepo-com.svg'
import type { UserRole } from '@/types/user'

const props = defineProps<{
  role: UserRole
  userName?: string
  mobile?: boolean
  menuOpen?: boolean
  menuId: string
}>()
const emit = defineEmits<{ 'open-menu': [] }>()
const roleLabel = computed(
  () => ({ ADMINISTRATOR: 'Administrador', EMPLOYEE: 'Empleado', CLIENT: 'Cliente' })[props.role],
)
</script>

<template>
  <header class="dashboard-header">
    <div class="header-context">
      <button
        v-if="mobile"
        type="button"
        class="menu-button"
        aria-label="Abrir menú"
        :aria-expanded="menuOpen"
        :aria-controls="menuId"
        aria-haspopup="dialog"
        @click="emit('open-menu')"
      >
        <i class="bi bi-list" aria-hidden="true"></i>
      </button>
      <p class="role-label">Sesión iniciada como {{ roleLabel }}</p>
    </div>
    <div class="user-profile">
      <slot name="profile">
        <img :src="defaultProfileImage" alt="" aria-hidden="true" />
      </slot>
      <span v-if="userName" class="user-name">{{ userName }}</span>
    </div>
  </header>
</template>

<style scoped>
.dashboard-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 24px;
  min-height: 92px;
  padding: 16px 32px;
  border-bottom: 1px solid var(--border-on-dark);
  background: var(--surface-background);
  color: var(--text-on-dark);
}

.header-context,
.user-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.role-label {
  margin: 0;
  font-size: 1.125rem;
}

.user-profile {
  max-width: 100%;
}

.user-profile > .bi {
  color: var(--accent-color);
  font-size: 1.75rem;
}

.user-profile > img {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 50%;
  color: var(--accent-color);
}

.user-name {
  overflow-wrap: anywhere;
  font-weight: 600;
}

.menu-button {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 1px solid var(--button-background);
  border-radius: var(--radius-small);
  color: var(--button-text);
  background: var(--button-background);
  font-size: 1.5rem;
}

.menu-button:hover {
  background: var(--button-hover-background);
}

.menu-button:focus-visible {
  outline: 2px solid var(--focus-on-dark);
  outline-offset: 2px;
}

@media (max-width: 767px) {
  .dashboard-header {
    min-height: 76px;
    padding: 12px 16px;
  }
}
</style>
