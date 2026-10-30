// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import SeatSelector from '@/components/Seats/SeatSelector.vue'
import type {
  Seat,
  SeatSelectionLimit,
  SeatState,
} from '@/types/seats'

const MovieSeatStub = defineComponent({
  name: 'MovieSeat',
  props: ['seat', 'selected', 'disabled'],
  emits: ['toggle'],
  template: `
    <button
      type="button"
      :data-seat="seat.rowNumber + '-' + seat.columnNumber"
      :disabled="disabled"
      :aria-pressed="selected"
      @click="$emit('toggle', seat)"
    >
      {{ seat.rowNumber }}-{{ seat.columnNumber }}
    </button>
  `,
})

function makeSeat(
  rowNumber: number,
  columnNumber: number,
  overrides: Partial<Seat> = {},
): Seat {
  return {
    theaterId: 7,
    rowNumber,
    columnNumber,
    type: 'normal',
    state: 'free',
    ...overrides,
  }
}

interface SelectorProps {
  theaterId: number
  rows: number
  columns: number
  seats: Seat[]
  maxSelections: SeatSelectionLimit
  selectableStates: SeatState[]
  disabled: boolean
}

function mountSelector(overrides: Partial<SelectorProps> = {}) {
  return mount(SeatSelector, {
    props: {
      theaterId: 7,
      rows: 2,
      columns: 3,
      seats: [
        makeSeat(1, 1),
        makeSeat(1, 2),
        makeSeat(1, 3),
        makeSeat(2, 1),
        makeSeat(2, 2),
        makeSeat(2, 3),
      ],
      ...overrides,
    },
    global: {
      stubs: {
        MovieSeat: MovieSeatStub,
      },
    },
  })
}

type SelectorWrapper = ReturnType<typeof mountSelector>

function lastSelection(wrapper: SelectorWrapper): Seat[] | undefined {
  const events = wrapper.emitted<[Seat[]]>('selection-change')

  return events?.[events.length - 1]?.[0]
}

function actionButton(wrapper: SelectorWrapper, label: string) {
  const button = wrapper
    .findAll<HTMLButtonElement>('.actions button')
    .find(button => button.text() === label)

  if (!button) {
    throw new Error(`Button not found: ${label}`)
  }

  return button
}

describe('SeatSelector', () => {
  it('renders the screen, rows, seats and initial empty selection', () => {
    const wrapper = mountSelector()

    expect(wrapper.get('.screen').text()).toBe('PANTALLA')
    expect(wrapper.findAll('.seat-row')).toHaveLength(2)
    expect(wrapper.findAll('.seat-cell')).toHaveLength(6)
    expect(wrapper.findAll('[data-seat]')).toHaveLength(6)
    expect(lastSelection(wrapper)).toEqual([])
  })

  it('places vertical aisles at thirds and a horizontal aisle halfway', () => {
    const wrapper = mountSelector({
      rows: 4,
      columns: 9,
      seats: [],
    })

    const rows = wrapper.findAll('.seat-row')

    for (const row of rows) {
      const aisleColumns = row.findAll('.seat-cell')
        .flatMap((cell, index) =>
          cell.classes().includes('vertical-aisle') ? [index + 1] : [],
        )

      expect(aisleColumns).toEqual([3, 6])
    }

    expect(rows[1]!.classes()).toContain('horizontal-aisle')
    expect(wrapper.findAll('.horizontal-aisle')).toHaveLength(1)
  })

  it('ignores seats from other theaters or outside the dimensions', () => {
    const wrapper = mountSelector({
      seats: [
        makeSeat(1, 1),
        makeSeat(1, 2, { theaterId: 9 }),
        makeSeat(3, 1),
        makeSeat(1, 4),
      ],
    })

    expect(wrapper.findAll('[data-seat]')).toHaveLength(1)
    expect(wrapper.get('[data-seat]').attributes('data-seat')).toBe('1-1')
    expect(wrapper.findAll('.missing-seat')).toHaveLength(5)
  })

  it.each([
    [0, 3],
    [2, -1],
    [1.5, 3],
    [101, 100],
  ])('rejects invalid dimensions %s by %s', (rows, columns) => {
    const wrapper = mountSelector({ rows, columns })

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Las dimensiones deben ser enteros positivos',
    )
    expect(wrapper.find('.seat-matrix').exists()).toBe(false)
  })

  it('selects multiple seats, emits copies, and deselects on another click', async () => {
    const first = makeSeat(1, 1)
    const second = makeSeat(1, 2)
    const wrapper = mountSelector({ seats: [first, second] })

    await wrapper.get('[data-seat="1-1"]').trigger('click')
    await wrapper.get('[data-seat="1-2"]').trigger('click')

    expect(lastSelection(wrapper)).toEqual([first, second])
    expect(lastSelection(wrapper)?.[0]).not.toBe(first)
    expect(
      wrapper.get('[data-seat="1-1"]').attributes('aria-pressed'),
    ).toBe('true')

    await wrapper.get('[data-seat="1-1"]').trigger('click')

    expect(lastSelection(wrapper)).toEqual([second])
  })

  it('enforces the limit while allowing selected seats to be deselected', async () => {
    const wrapper = mountSelector({ maxSelections: 1 })

    await wrapper.get('[data-seat="1-1"]').trigger('click')

    expect(
      wrapper.get<HTMLButtonElement>('[data-seat="1-2"]').element.disabled,
    ).toBe(true)
    expect(
      wrapper.get<HTMLButtonElement>('[data-seat="1-1"]').element.disabled,
    ).toBe(false)

    await wrapper.get('[data-seat="1-2"]').trigger('click')

    expect(lastSelection(wrapper)).toEqual([makeSeat(1, 1)])

    await wrapper.get('[data-seat="1-1"]').trigger('click')

    expect(lastSelection(wrapper)).toEqual([])
    expect(
      wrapper.get<HTMLButtonElement>('[data-seat="1-2"]').element.disabled,
    ).toBe(false)
    expect(wrapper.findAll('.actions button')).toHaveLength(1)
  })

  it('only allows free seats by default and supports administrative selection', async () => {
    const reserved = makeSeat(1, 2, { state: 'reserved' })
    const wrapper = mountSelector({
      seats: [makeSeat(1, 1), reserved],
    })

    expect(
      wrapper.get<HTMLButtonElement>('[data-seat="1-2"]').element.disabled,
    ).toBe(true)

    await wrapper.setProps({
      selectableStates: ['free', 'reserved'],
    })
    await wrapper.get('[data-seat="1-2"]').trigger('click')

    expect(lastSelection(wrapper)).toEqual([reserved])
  })

  it('selects all eligible seats and clears the selection', async () => {
    const free = makeSeat(1, 1)
    const reserved = makeSeat(1, 2, { state: 'reserved' })
    const wrapper = mountSelector({
      seats: [free, reserved],
      maxSelections: 'all',
    })

    await actionButton(wrapper, 'Seleccionar todos').trigger('click')

    expect(lastSelection(wrapper)).toEqual([free])

    await actionButton(wrapper, 'Limpiar selección').trigger('click')

    expect(lastSelection(wrapper)).toEqual([])
  })

  it('blocks interaction when disabled without clearing selection', async () => {
    const wrapper = mountSelector()

    await wrapper.get('[data-seat="1-1"]').trigger('click')
    await wrapper.setProps({ disabled: true })

    for (const button of wrapper.findAll('button')) {
      expect(button.element.disabled).toBe(true)
    }

    await wrapper.get('[data-seat="1-2"]').trigger('click')

    expect(lastSelection(wrapper)).toEqual([makeSeat(1, 1)])
  })

  it('removes a selected seat when it disappears or becomes unavailable', async () => {
    const first = makeSeat(1, 1)
    const second = makeSeat(1, 2)
    const wrapper = mountSelector({ seats: [first, second] })

    await wrapper.get('[data-seat="1-1"]').trigger('click')
    await wrapper.get('[data-seat="1-2"]').trigger('click')

    await wrapper.setProps({ seats: [second] })

    expect(lastSelection(wrapper)).toEqual([second])

    await wrapper.setProps({
      seats: [{ ...second, state: 'unavailable' }],
    })

    expect(lastSelection(wrapper)).toEqual([])
  })

  it('keeps the earliest selections when the limit decreases', async () => {
    const wrapper = mountSelector()

    await wrapper.get('[data-seat="1-1"]').trigger('click')
    await wrapper.get('[data-seat="1-2"]').trigger('click')
    await wrapper.setProps({ maxSelections: 1 })

    expect(lastSelection(wrapper)).toEqual([makeSeat(1, 1)])
  })

  it('clears selection when switching to another theater', async () => {
    const wrapper = mountSelector()

    await wrapper.get('[data-seat="1-1"]').trigger('click')

    await wrapper.setProps({
      theaterId: 9,
      seats: [makeSeat(1, 1, { theaterId: 9 })],
    })

    expect(lastSelection(wrapper)).toEqual([])
    expect(
      wrapper.get('[data-seat="1-1"]').attributes('aria-pressed'),
    ).toBe('false')
  })

  it('shows a message when no seats are registered', () => {
    const wrapper = mountSelector({ seats: [] })

    expect(wrapper.text()).toContain('No hay asientos registrados.')
    expect(wrapper.findAll('[data-seat]')).toHaveLength(0)
    expect(
      actionButton(wrapper, 'Seleccionar todos').element.disabled,
    ).toBe(true)
  })
})
