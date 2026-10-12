import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TheaterForm from '@/components/theaters/TheaterForm.vue'

const props = { submitLabel: 'Guardar', submittingLabel: 'Guardando…' }

describe('TheaterForm projector select', () => {
  it('shows "No hay proyectores" when there are no projectors', () => {
    const select = mount(TheaterForm, { props }).get('[name="projectorName"]')

    expect(select.text()).toContain('No hay proyectores')
  })

  it('does not show it while options are loading or when projectors exist', () => {
    const loading = mount(TheaterForm, { props: { ...props, optionsLoading: true } })
    const loaded = mount(TheaterForm, {
      props: { ...props, projectors: [{ projectorId: 1, name: 'IMAX' }] },
    })

    expect(loading.get('[name="projectorName"]').text()).not.toContain('No hay proyectores')
    expect(loaded.get('[name="projectorName"]').text()).not.toContain('No hay proyectores')
  })
})

describe('TheaterForm status select', () => {
  it('shows "No hay estados" when there are no statuses', () => {
    const select = mount(TheaterForm, { props }).get('[name="status"]')

    expect(select.text()).toBe('No hay estados')
  })

  it('does not show it while options are loading', () => {
    const select = mount(TheaterForm, { props: { ...props, optionsLoading: true } }).get(
      '[name="status"]',
    )

    expect(select.text()).toBe('')
  })

  it('lists the statuses and selects the first by default', () => {
    const wrapper = mount(TheaterForm, {
      props: {
        ...props,
        statuses: [
          { theaterStatusId: 1, name: 'Disponible' },
          { theaterStatusId: 2, name: 'En función' },
        ],
      },
    })
    const select = wrapper.get<HTMLSelectElement>('[name="status"]')

    expect(select.text()).not.toContain('No hay estados')
    expect(select.findAll('option').map((option) => option.text())).toEqual([
      'Disponible',
      'En función',
    ])
    expect(select.element.value).toBe('Disponible')
  })
})
