import { describe, expect, it } from 'vitest'
import {
  administratorSectionIds,
  availableSectionsFor,
  dashboardSections,
  visibleSectionsFor,
} from '@/components/layout/dashboard-sections'

describe('dashboard sections registry', () => {
  it('has unique ids', () => {
    const ids = dashboardSections.map((section) => section.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never lets employees open an administrator-only section', () => {
    const adminOnlySections = dashboardSections.filter((section) => section.adminOnly)

    for (const section of adminOnlySections) expect(section.roles).not.toContain('EMPLOYEE')
    const administratorIds = availableSectionsFor('ADMINISTRATOR')

    for (const id of availableSectionsFor('EMPLOYEE')) expect(administratorIds).toContain(id)
  })

  it('hides administrator-only sections from employees in the sidebar', () => {
    const employeeIds = visibleSectionsFor('EMPLOYEE').map((section) => section.id)

    expect(employeeIds).not.toContain('tickets')
    // SCRUM-17 (UT-047): employees do not see Transacciones.
    expect(employeeIds).not.toContain('transactions')
    expect(employeeIds).toContain('clients')
    expect(visibleSectionsFor('ADMINISTRATOR')).toHaveLength(dashboardSections.length)
  })

  it('moves employees away from sections only administrators can open', () => {
    expect(administratorSectionIds).toContain('tickets')
    expect(administratorSectionIds).toContain('transactions')
    expect(availableSectionsFor('ADMINISTRATOR')).toContain('transactions')
    expect(administratorSectionIds).not.toContain('clients')
    expect(administratorSectionIds).not.toContain('password')
  })
})
