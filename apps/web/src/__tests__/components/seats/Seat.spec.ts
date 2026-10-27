// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MovieSeat from '@/components/Seats/MovieSeat.vue'
import type { Seat } from '@/types/seats'

describe('Seat', () => {
  const seat: Seat = {
    theaterId: 7,
    rowNumber: 2,
    columnNumber: 5,
    type: 'normal',
    state: 'free',
  }

  it('displays the seat number and accessible information', () => {
    const wrapper = mount(MovieSeat, {
      props: { seat },
    })

    const button = wrapper.get('button')
    const label = 'Sala 7, Fila 2, columna 5, Normal, Libre'

    expect(wrapper.get('.seat-number').text()).toBe('2-5')
    expect(button.attributes('aria-label')).toBe(label)
    expect(button.attributes('title')).toBe(label)
    expect(button.attributes('type')).toBe('button')
    expect(button.element.disabled).toBe(false)
  })

  it.each(['normal', 'vip', 'accessibility'] as const)(
    'renders the %s seat style and icon',
    (type) => {
      const wrapper = mount(MovieSeat, {
        props: { seat: { ...seat, type } },
      })

      expect(wrapper.get('button').classes()).toContain(`seat--${type}`)

      // Chair back for normal/VIP; wheelchair wheel/head for accessibility.
      expect(wrapper.find('svg rect').exists())
        .toBe(type !== 'accessibility')
      expect(wrapper.find('svg circle').exists())
        .toBe(type === 'accessibility')

      // The VIP star is the filled path.
      expect(wrapper.find('svg path[fill="currentColor"]').exists())
        .toBe(type === 'vip')
    },
  )

  it.each(['free', 'unavailable', 'in-use', 'reserved'] as const)(
    'applies the %s state class',
    (state) => {
      const wrapper = mount(MovieSeat, {
        props: { seat: { ...seat, state } },
      })

      expect(wrapper.get('button').classes()).toContain(`seat--${state}`)
    },
  )

  it('updates the selection indicator when selected changes', async () => {
    const wrapper = mount(MovieSeat, {
      props: { seat },
    })

    const button = wrapper.get('button')

    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.classes()).not.toContain('seat--selected')
    expect(wrapper.find('.selection-mark').exists()).toBe(false)

    await wrapper.setProps({ selected: true })

    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.classes()).toContain('seat--selected')
    expect(wrapper.get('.selection-mark').text()).toBe('✓')

    await wrapper.setProps({ selected: false })

    expect(button.attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('.selection-mark').exists()).toBe(false)
  })

  it('emits a copy of the complete seat when clicked', async () => {
    const wrapper = mount(MovieSeat, {
      props: { seat },
    })

    await wrapper.get('button').trigger('click')

    const events = wrapper.emitted('toggle')

    expect(events).toHaveLength(1)
    expect(events?.[0]).toEqual([seat])
    expect(events?.[0]?.[0]).not.toBe(seat)

    // Selection remains controlled by the parent.
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('false')
  })

  it('disables the button and does not emit when disabled', async () => {
    const wrapper = mount(MovieSeat, {
      props: { seat, disabled: true },
    })

    expect(wrapper.get('button').element.disabled).toBe(true)

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('updates the displayed identity when the seat changes', async () => {
    const wrapper = mount(MovieSeat, {
      props: { seat },
    })

    await wrapper.setProps({
      seat: {
        ...seat,
        theaterId: 9,
        rowNumber: 3,
        columnNumber: 8,
      },
    })

    expect(wrapper.get('.seat-number').text()).toBe('3-8')
    expect(wrapper.get('button').attributes('aria-label')).toBe(
      'Sala 9, Fila 3, columna 8, Normal, Libre',
    )
  })
})
