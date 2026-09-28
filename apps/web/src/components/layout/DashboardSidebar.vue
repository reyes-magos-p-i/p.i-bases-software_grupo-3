<script setup lang="ts">
import { computed, useId } from 'vue'
import type { UserRole } from '@/types/user'

const props = withDefaults(
  defineProps<{
    role: UserRole
    activeSection?: string
    availableSections?: readonly string[]
    collapsed?: boolean
    mobile?: boolean
    canLogout?: boolean
  }>(),
  { availableSections: () => [] },
)

const emit = defineEmits<{
  navigate: [section: string]
  'toggle-collapse': []
  close: []
  logout: []
}>()

const navigationId = useId()
const sections = [
  { id: 'dashboard', label: 'Tablero', icon: 'bi-grid', administratorOnly: true },
  { id: 'rooms', label: 'Salas', icon: 'bi-display' },
  { id: 'movies', label: 'Películas', icon: 'bi-film' },
  { id: 'employees', label: 'Empleados', icon: 'bi-person-circle', administratorOnly: true },
  { id: 'clients', label: 'Clientes', icon: 'bi-people' },
  { id: 'screenings', label: 'Proyecciones', icon: 'bi-calendar-event' },
  { id: 'branches', label: 'Sucursales', icon: 'bi-building' },
  { id: 'password', label: 'Cambiar contraseña', icon: 'bi-key' },
  { id: 'account', label: 'Ajustes de cuenta', icon: 'bi-gear' },
  { id: 'help', label: 'Asistencia', icon: 'bi-question-circle' },
]

const visibleSections = computed(() => {
  if (props.role !== 'ADMINISTRATOR' && props.role !== 'EMPLOYEE') return []
  return sections.filter((section) => !section.administratorOnly || props.role === 'ADMINISTRATOR')
})
const title = computed(
  () =>
    visibleSections.value.find((section) => section.id === props.activeSection)?.label ??
    'Cinetadel',
)
const compact = computed(() => props.collapsed && !props.mobile)
const isAvailable = (section: string) => props.availableSections.includes(section)
</script>

<template>
  <div class="dashboard-sidebar" :class="{ 'is-compact': compact }">
    <div class="sidebar-heading">
      <span v-if="!compact" class="sidebar-title">{{ title }}</span>
      <button
        v-if="mobile"
        type="button"
        class="sidebar-control"
        aria-label="Cerrar menú"
        @click="emit('close')"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
      <button
        v-else
        type="button"
        class="sidebar-control"
        :aria-label="compact ? 'Expandir menú' : 'Plegar menú'"
        :title="compact ? 'Expandir menú' : 'Plegar menú'"
        :aria-expanded="!compact"
        :aria-controls="navigationId"
        @click="emit('toggle-collapse')"
      >
        <i
          :class="['bi', compact ? 'bi-chevron-double-right' : 'bi-chevron-double-left']"
          aria-hidden="true"
        ></i>
      </button>
    </div>

    <nav :id="navigationId" class="sidebar-navigation" aria-label="Navegación del dashboard">
      <ul>
        <li v-for="section in visibleSections" :key="section.id">
          <button
            type="button"
            class="navigation-item"
            :class="{ 'is-active': activeSection === section.id && isAvailable(section.id) }"
            :disabled="!isAvailable(section.id)"
            :aria-current="
              activeSection === section.id && isAvailable(section.id) ? 'page' : undefined
            "
            :aria-label="section.label + (isAvailable(section.id) ? '' : ' (Pendiente)')"
            :title="section.label + (isAvailable(section.id) ? '' : ' (Pendiente)')"
            @click="emit('navigate', section.id)"
          >
            <i :class="['bi', section.icon]" aria-hidden="true"></i>
            <span v-if="!compact" class="navigation-label">
              {{ section.label }}
              <small v-if="!isAvailable(section.id)">Pendiente</small>
            </span>
          </button>
        </li>
      </ul>
    </nav>

    <button
      type="button"
      class="navigation-item logout-button"
      :disabled="!canLogout"
      :aria-label="canLogout ? 'Cerrar sesión' : 'Cerrar sesión (Pendiente)'"
      :title="canLogout ? 'Cerrar sesión' : 'Cerrar sesión (Pendiente)'"
      @click="emit('logout')"
    >
      <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
      <span v-if="!compact" class="navigation-label">
        Cerrar sesión
        <small v-if="!canLogout">Pendiente</small>
      </span>
    </button>
  </div>
</template>

<style scoped>
.dashboard-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px 12px;
  color: var(--color-white);
  background: var(--color-primary);
}

.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 64px;
  padding-inline: 8px;
}

.sidebar-title {
  overflow-wrap: anywhere;
  font-size: 1.25rem;
  font-weight: 700;
}

.sidebar-control,
.navigation-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  min-height: 44px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  color: inherit;
  background: transparent;
}

.sidebar-control {
  flex-shrink: 0;
  justify-content: center;
  min-width: 44px;
}

.sidebar-navigation {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-block: 16px;
  padding: 4px;
}

.sidebar-navigation ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.navigation-item {
  width: 100%;
  text-align: left;
}

.navigation-item .bi {
  flex-shrink: 0;
  font-size: 1.35rem;
}

.navigation-label {
  overflow-wrap: anywhere;
  font-weight: 600;
}

.navigation-label small {
  display: block;
  font-size: 0.75rem;
  font-weight: 400;
}

.navigation-item:disabled {
  color: var(--color-light_gray);
  cursor: not-allowed;
}

.sidebar-control:hover,
.navigation-item:not(:disabled):hover {
  background: color-mix(in srgb, var(--color-white) 12%, transparent);
}

.navigation-item.is-active {
  background: var(--bs-primary);
}

.sidebar-control:focus-visible,
.navigation-item:focus-visible {
  outline: 2px solid var(--color-cream);
  outline-offset: 2px;
}

.logout-button {
  border-color: var(--color-light_gray);
}

.is-compact .sidebar-heading,
.is-compact .navigation-item {
  justify-content: center;
  padding-inline: 0;
}
</style>
