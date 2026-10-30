import type { Component } from 'vue'
import type { UserRole } from '@/types/user'
import TheatersSection from '@/components/theaters/TheatersSection.vue'
import ProjectionsSection from '@/components/projections/ProjectionsSection.vue'
import TicketsSection from '@/components/tickets/TicketsSection.vue'
import BranchesSection from '@/components/branches/BranchesSection.vue'

export type DashboardSectionId =
  | 'dashboard'
  | 'theaters'
  | 'movies'
  | 'employees'
  | 'clients'
  | 'screenings'
  | 'tickets'
  | 'branches'
  | 'password'
  | 'account'
  | 'help'

type StaffRole = 'ADMINISTRATOR' | 'EMPLOYEE'

export interface DashboardSectionDefinition {
  id: DashboardSectionId
  label: string
  icon: string
  /** Hidden from employees in the sidebar. */
  adminOnly?: boolean
  /** Roles that can open the section. Empty means the entry is pending. */
  roles: StaffRole[]
  /** Rendered by DashboardView. Omit it to use the shared section fallback. */
  component?: Component
}

// Sidebar order follows this array.
export const dashboardSections: readonly DashboardSectionDefinition[] = [
  { id: 'dashboard', label: 'Tablero', icon: 'bi-grid', adminOnly: true, roles: [] },
  {
    id: 'theaters',
    label: 'Salas',
    icon: 'bi-display',
    adminOnly: true,
    roles: ['ADMINISTRATOR'],
    component: TheatersSection,
  },
  { id: 'movies', label: 'Películas', icon: 'bi-film', roles: ['ADMINISTRATOR'] },
  {
    id: 'employees',
    label: 'Empleados',
    icon: 'bi-person-circle',
    adminOnly: true,
    roles: ['ADMINISTRATOR'],
  },
  { id: 'clients', label: 'Clientes', icon: 'bi-people', roles: ['ADMINISTRATOR', 'EMPLOYEE'] },
  {
    id: 'screenings',
    label: 'Proyecciones',
    icon: 'bi-calendar-event',
    roles: ['ADMINISTRATOR'],
    component: ProjectionsSection,
  },
  {
    id: 'tickets',
    label: 'Tickets',
    icon: 'bi-ticket-perforated',
    adminOnly: true,
    roles: ['ADMINISTRATOR'],
    component: TicketsSection,
  },
  {
    id: 'branches',
    label: 'Sucursales',
    icon: 'bi-building',
    adminOnly: true,
    roles: ['ADMINISTRATOR'],
    component: BranchesSection,
  },
  {
    id: 'password',
    label: 'Cambiar contraseña',
    icon: 'bi-key',
    roles: ['ADMINISTRATOR', 'EMPLOYEE'],
  },
  { id: 'account', label: 'Ajustes de cuenta', icon: 'bi-gear', roles: [] },
  { id: 'help', label: 'Asistencia', icon: 'bi-question-circle', roles: [] },
]

function isStaffRole(role: UserRole): role is StaffRole {
  return role === 'ADMINISTRATOR' || role === 'EMPLOYEE'
}

export function visibleSectionsFor(role: UserRole) {
  if (!isStaffRole(role)) return []
  return dashboardSections.filter((section) => !section.adminOnly || role === 'ADMINISTRATOR')
}

export function availableSectionsFor(role: UserRole): DashboardSectionId[] {
  if (!isStaffRole(role)) return []
  return dashboardSections
    .filter((section) => section.roles.includes(role))
    .map((section) => section.id)
}

// Employees are moved away from these when the server reports they are no longer an administrator.
export const administratorSectionIds: readonly DashboardSectionId[] = dashboardSections
  .filter((section) => !section.roles.includes('EMPLOYEE'))
  .map((section) => section.id)
