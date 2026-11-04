import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TheaterSeatEditor from '@/components/theaters/TheaterSeatEditor.vue'
import SeatSelector from '@/components/Seats/SeatSelector.vue'
import { getTheaterSeats, updateSeatStatuses } from '@/services/theater.service'
import type { Seat } from '@/types/seats'

vi.mock('@/services/theater.service', () => ({
  getTheaterSeats: vi.fn(),
  updateSeatStatuses: vi.fn(),
}))

const seats: Seat[] = [
  { theaterId: 7, rowNumber: 1, columnNumber: 2, state: 'free', type: 'normal' },
]
let wrapper: VueWrapper

function render(props: { readonly?: boolean; disabled?: boolean } = {}) {
  wrapper = mount(TheaterSeatEditor, {
    props: { theaterId: 7, rows: 8, columns: 10, ...props },
    global: { stubs: { SeatSelector: true } },
  })
  return wrapper
}

async function chooseChanges(state = '', type = '') {
  wrapper.getComponent(SeatSelector).vm.$emit('selection-change', seats)
  const selects = wrapper.findAll('select')
  if (state) await selects[0]!.setValue(state)
  if (type) await selects[1]!.setValue(type)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getTheaterSeats).mockResolvedValue(seats)
  vi.mocked(updateSeatStatuses).mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})

describe('TheaterSeatEditor', () => {
  it('loads the existing seats and allows selection of every administrative state', async () => {
    render()
    expect(wrapper.get('.dialog-section-title').text()).toBe('Estado de los asientos')
    expect(wrapper.get('[role="status"]').text()).toBe('Cargando asientos…')
    expect(wrapper.findComponent(SeatSelector).exists()).toBe(false)
    await flushPromises()
    await wrapper.setProps({ sectionNumber: 3 })
    expect(wrapper.get('.dialog-section-title').text()).toBe('3 Estado de los asientos')
    expect(getTheaterSeats).toHaveBeenCalledExactlyOnceWith(7)
    expect(wrapper.getComponent(SeatSelector).props()).toMatchObject({
      theaterId: 7,
      rows: 8,
      columns: 10,
      seats,
      maxSelections: 'all',
      selectableStates: ['free', 'unavailable', 'in-use', 'reserved'],
      disabled: false,
    })
    expect(wrapper.get('.save-button').attributes('disabled')).toBeDefined()
  })

  it('does not save without both a selection and a requested change', async () => {
    render()
    await flushPromises()
    await wrapper.findAll('select')[0]!.setValue('unavailable')
    await wrapper.get('.save-button').trigger('click')
    expect(updateSeatStatuses).not.toHaveBeenCalled()
    await wrapper.findAll('select')[0]!.setValue('Seleccione un estado')
    wrapper.getComponent(SeatSelector).vm.$emit('selection-change', seats)
    await flushPromises()
    await wrapper.get('.save-button').trigger('click')
    expect(updateSeatStatuses).not.toHaveBeenCalled()
  })

  it.each([
    ['unavailable', '', { state: 'unavailable' }],
    ['', 'vip', { type: 'vip' }],
    ['reserved', 'accessibility', { state: 'reserved', type: 'accessibility' }],
  ] as const)(
    'saves state %s and type %s, then reloads and clears the selection',
    async (state, type, changes) => {
      render()
      await flushPromises()
      await chooseChanges(state, type)
      await wrapper.get('.save-button').trigger('click')
      await flushPromises()
      expect(updateSeatStatuses).toHaveBeenCalledExactlyOnceWith(7, {
        seats: [{ rowNumber: 1, columnNumber: 2 }],
        ...changes,
      })
      expect(getTheaterSeats).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[role="status"]').text()).toContain('Asientos actualizados.')
      expect(wrapper.findAll('select').map((select) => select.element.selectedIndex)).toEqual([
        0, 0,
      ])
      expect(wrapper.get('.save-button').attributes('disabled')).toBeDefined()
    },
  )

  it('prevents another submission while saving', async () => {
    let finish!: () => void
    vi.mocked(updateSeatStatuses).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    render()
    await flushPromises()
    await chooseChanges('free')
    await wrapper.get('.save-button').trigger('click')
    expect(wrapper.getComponent(SeatSelector).props('disabled')).toBe(true)
    expect(wrapper.get('.save-button').text()).toBe('Guardando…')
    await wrapper.get('.save-button').trigger('click')
    expect(updateSeatStatuses).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
    expect(wrapper.text()).toContain('Asientos actualizados.')
  })

  it.each([{ readonly: true }, { disabled: true }])(
    'respects the editing restriction %o',
    async (props) => {
      render(props)
      await flushPromises()
      expect(wrapper.getComponent(SeatSelector).props('disabled')).toBe(true)
      if (props.readonly) {
        expect(wrapper.getComponent(SeatSelector).props('maxSelections')).toBe(0)
        expect(wrapper.find('.seat-controls').exists()).toBe(false)
      } else {
        await chooseChanges('free')
        await wrapper.get('.save-button').trigger('click')
        expect(wrapper.get('.save-button').attributes('disabled')).toBeDefined()
      }
      expect(updateSeatStatuses).not.toHaveBeenCalled()
    },
  )

  it('reports a load failure and allows reloading the seats', async () => {
    vi.mocked(getTheaterSeats).mockRejectedValueOnce(new Error('offline'))
    render()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('No se pudieron cargar los asientos.')
    await wrapper.get('.seat-actions button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.getComponent(SeatSelector).props('seats')).toEqual(seats)
  })

  it('does not announce success if the updated seats cannot be reloaded', async () => {
    vi.mocked(getTheaterSeats)
      .mockResolvedValueOnce(seats)
      .mockRejectedValueOnce(new Error('offline'))
    render()
    await flushPromises()
    await chooseChanges('', 'vip')
    await wrapper.get('.save-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('No se pudieron cargar los asientos.')
    expect(wrapper.text()).not.toContain('Asientos actualizados.')
  })

  it.each([
    [
      {
        isAxiosError: true,
        response: {
          status: 400,
          data: { message: ['Selecciona un estado.', 'Selecciona un tipo.'] },
        },
      },
      'Selecciona un estado., Selecciona un tipo.',
    ],
    [
      {
        isAxiosError: true,
        response: { status: 409, data: { message: 'El asiento ya no está disponible.' } },
      },
      'El asiento ya no está disponible.',
    ],
    [{ isAxiosError: true }, 'No se pudieron actualizar los asientos.'],
    [new Error('offline'), 'No se pudieron actualizar los asientos.'],
  ])('reports a save failure without losing the pending selection: %o', async (error, message) => {
    vi.mocked(updateSeatStatuses).mockRejectedValueOnce(error)
    render()
    await flushPromises()
    await chooseChanges('unavailable')
    await wrapper.get('.save-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(message)
    expect(wrapper.get('.save-button').attributes('disabled')).toBeUndefined()
    expect(getTheaterSeats).toHaveBeenCalledTimes(1)
  })

  it.each(['resolve', 'reject'])('ignores a stale seat load that later %ss', async (outcome) => {
    let finish!: (value: Seat[]) => void
    let fail!: (error: Error) => void
    vi.mocked(getTheaterSeats).mockReturnValueOnce(
      new Promise((resolve, reject) => {
        finish = resolve
        fail = reject
      }),
    )
    render()
    const current = [{ ...seats[0]!, theaterId: 8 }]
    vi.mocked(getTheaterSeats).mockResolvedValueOnce(current)
    await wrapper.setProps({ theaterId: 8 })
    await flushPromises()
    if (outcome === 'resolve') finish(seats)
    else fail(new Error('old request'))
    await flushPromises()
    expect(wrapper.getComponent(SeatSelector).props('seats')).toEqual(current)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it.each(['resolve', 'reject'])(
    'ignores a save for the previous theater that later %ss',
    async (outcome) => {
      let finish!: () => void
      let fail!: (error: Error) => void
      vi.mocked(updateSeatStatuses).mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finish = resolve
          fail = reject
        }),
      )
      render()
      await flushPromises()
      await chooseChanges('unavailable')
      await wrapper.get('.save-button').trigger('click')
      await wrapper.setProps({ theaterId: 8 })
      await flushPromises()
      if (outcome === 'resolve') finish()
      else fail(new Error('old save'))
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Asientos actualizados.')
      expect(getTheaterSeats).toHaveBeenCalledTimes(2)
    },
  )
})
