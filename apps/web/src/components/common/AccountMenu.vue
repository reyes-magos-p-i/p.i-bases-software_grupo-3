<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import type { ClientIdentity } from '@/types/client-auth'

const props = defineProps<{ user: ClientIdentity }>()
const emit = defineEmits<{ (event: 'logout'): void }>()
const menuOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const dropdownId = useId()
const fullName = computed(() =>
  [props.user.firstName, props.user.lastName].filter(Boolean).join(' '),
)

function closeOnOutsideClick(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) {
    menuOpen.value = false
  }
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value) {
    menuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsideClick)
  document.addEventListener('keydown', closeOnEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsideClick)
  document.removeEventListener('keydown', closeOnEscape)
})
</script>

<template>
  <div ref="root" class="account-menu">
    <span class="account-name">{{ fullName }}</span>
    <button
      class="account-avatar"
      type="button"
      :aria-label="`Abrir menú de perfil de ${fullName}`"
      :aria-controls="dropdownId"
      :aria-expanded="menuOpen"
      @click="menuOpen = !menuOpen"
    >
      <span class="visually-hidden">Foto de perfil sin configurar</span>
    </button>
    <section
      v-if="menuOpen"
      :id="dropdownId"
      class="account-dropdown"
      :aria-label="`Perfil de ${fullName}`"
    >
      <div class="account-details" aria-label="Datos de la cuenta">
        <p class="account-detail">
          <i class="bi bi-person" aria-hidden="true"></i>
          <span>{{ fullName }}</span>
        </p>
        <p class="account-detail">
          <i class="bi bi-envelope" aria-hidden="true"></i>
          <span>{{ user.email }}</span>
        </p>
      </div>
      <div class="account-actions" aria-label="Opciones de cuenta">
        <button type="button" disabled title="Próximamente">
          <i class="bi bi-person-badge" aria-hidden="true"></i>
          Personalizar perfil
        </button>
        <button type="button" disabled title="Próximamente">
          <i class="bi bi-gear" aria-hidden="true"></i>
          Ajustes de Cuenta
        </button>
        <button type="button" disabled title="Próximamente">
          <i class="bi bi-key" aria-hidden="true"></i>
          Cambiar Contraseña
        </button>
      </div>
    </section>
    <button
      class="account-logout"
      type="button"
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      @click="emit('logout')"
    >
      <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
    </button>
  </div>
</template>

<style scoped>
.account-menu {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  padding-inline: 20px;
}

.account-name {
  font-weight: 700;
  white-space: nowrap;
}

.account-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  padding: 0;
  border: 1px solid var(--accent-color);
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
}

.account-avatar:hover,
.account-avatar:focus-visible {
  border-color: var(--accent-color);
  outline: 2px solid var(--focus-on-dark);
  outline-offset: 2px;
}

.account-dropdown {
  position: absolute;
  z-index: 20;
  top: calc(100% - 2px);
  right: 64px;
  width: min(280px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--content-background);
  box-shadow: 0 8px 24px var(--shadow-color);
  color: var(--text-primary);
}

.account-detail {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.account-detail + .account-detail {
  margin-top: 8px;
}

.account-detail span {
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.account-detail i {
  width: 18px;
  flex: 0 0 18px;
  color: var(--text-primary);
  text-align: center;
}

.account-actions {
  display: grid;
  gap: 2px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.account-actions button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
}

.account-actions button:disabled {
  color: var(--text-disabled);
}

.account-logout {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-on-dark);
  cursor: pointer;
  font-size: 1.25rem;
}

.account-logout:hover {
  background: var(--surface-on-dark-hover);
  color: var(--accent-color);
}

.account-logout:focus-visible {
  outline: 2px solid var(--focus-on-dark);
  outline-offset: 2px;
}

@media (max-width: 576px) {
  .account-menu {
    gap: 8px;
    padding-inline: 8px;
  }

  .account-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .account-avatar {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
  }

  .account-dropdown {
    right: 48px;
  }
}
</style>