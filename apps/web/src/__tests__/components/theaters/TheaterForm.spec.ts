import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TheaterForm from '@/components/theaters/TheaterForm.vue'

const props = { submitLabel: 'Guardar', submittingLabel: 'Guardando…' }

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
