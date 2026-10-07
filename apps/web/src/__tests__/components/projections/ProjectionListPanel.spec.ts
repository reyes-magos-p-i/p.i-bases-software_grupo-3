import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ProjectionListPanel from '@/components/projections/ProjectionListPanel.vue'
import ProjectionDetailDialog from '@/components/projections/ProjectionDetailDialog.vue'
import type { ListedProjection, ProjectionList } from '@/types/projection'

const { getProjections, getProjectionFilterOptions } = vi.hoisted(() => ({
  getProjections: vi.fn(),
  getProjectionFilterOptions: vi.fn(),
}))
vi.mock('@/services/projection.service', () => ({
  getProjections,
  getProjectionFilterOptions,
  getProjectionDetail: vi.fn(() => new Promise(() => {})),
}))

const item: ListedProjection = {
  movieFunctionId: 7,
  movieId: 3,
  movieTitle: 'The Odyssey',
  branchId: 2,
  branchName: 'Mall Oxígeno',
  theaterId: 4,
  startTime: '2099-09-14T13:00',
  endTime: '2099-09-14T15:02',
  status: 'CANCELLED',
  price: 3500,
}
const list = (overrides: Partial<ProjectionList> = {}): ProjectionList => ({
  items: [item],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  ...overrides,
})
const options = {
  cinemas: [
    { branchId: 2, name: 'Mall Oxígeno' },
    { branchId: 5, name: 'Multiplaza' },
  ],
  theaters: [
    { theaterId: 4, branchId: 2, numberOfSeats: 80 },
    { theaterId: 9, branchId: 5, numberOfSeats: 120 },
  ],
  movies: [{ movieId: 3, title: 'The Odyssey' }],
}
const httpError = (status: number) => ({ isAxiosError: true, response: { status } })
let wrapper: VueWrapper<InstanceType<typeof ProjectionListPanel>> | undefined

async function render() {
  wrapper = mount(ProjectionListPanel, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

const field = (name: string) => wrapper!.get(`[name="${name}"]`)
const lastQuery = () => getProjections.mock.lastCall![0]

beforeEach(() => {
  getProjections.mockReset().mockResolvedValue(list())
  getProjectionFilterOptions.mockReset().mockResolvedValue(options)
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: vi.fn() })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  document.body.innerHTML = ''
})

describe('ProjectionListPanel', () => {
  it('lists projections with the columns of the design', async () => {
    await render()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10 })
    expect(wrapper!.findAll('th').map((th) => th.text())).toEqual([
      'No.',
      'Película',
      'ID Proyección',
      'Sucursal',
      'Sala',
      'Fecha',
      'Hora',
      'Duración',
      'Precio',
      'Estado',
      'Acciones',
    ])
    const cells = wrapper!.findAll('tbody td').map((td) => td.text())
    expect(cells.slice(0, 8)).toEqual([
      '1',
      'The Odyssey',
      'MF-007',
      'Mall Oxígeno',
      'Sala 4',
      '14/09/2099',
      '1:00 pm',
      '2 horas 2 minutos',
    ])
    expect(cells[9]).toBe('Cancelada')
    expect(wrapper!.get('.result-count').text()).toBe('1 proyección')
  })

  it('combines the selection filters and restarts from the first page', async () => {
    getProjections.mockResolvedValue(list({ page: 2, totalPages: 3, total: 21 }))
    await render()
    await field('status').setValue('ACTIVE')
    await field('branchId').setValue('5')
    expect(wrapper!.findAll('[name="theaterId"] option').map((option) => option.text())).toEqual([
      'Todas',
      'Sala 9',
    ])
    await field('theaterId').setValue('9')
    await field('movieId').setValue('3')
    expect(field('branchId').attributes('title')).toBe('Multiplaza')
    expect(field('movieId').attributes('title')).toBe('The Odyssey')
    const times = wrapper!.findAll('[name="timeFrom"] option').map((option) => option.text())
    expect(times).toHaveLength(49)
    expect(times.slice(0, 3)).toEqual(['Cualquiera', '12:00 am', '12:30 am'])
    expect(times[27]).toBe('1:00 pm')
    expect(wrapper!.findAll('.format-hint').map((hint) => hint.text())).toEqual([
      '(dd/mm/aaaa)',
      '(dd/mm/aaaa)',
      '(12 h, hh:mm am/pm)',
      '(12 h, hh:mm am/pm)',
    ])
    await field('dateFrom').setValue('2099-09-01')
    await field('dateFrom').trigger('change')
    await field('dateTo').setValue('2099-09-30')
    await field('dateTo').trigger('change')
    await field('timeFrom').setValue('12:00')
    await field('timeFrom').trigger('change')
    await field('timeTo').setValue('18:00')
    await field('timeTo').trigger('change')
    await flushPromises()

    expect(lastQuery()).toEqual({
      page: 1,
      pageSize: 10,
      status: 'ACTIVE',
      branchId: 5,
      theaterId: 9,
      movieId: 3,
      dateFrom: '2099-09-01',
      dateTo: '2099-09-30',
      timeFrom: '12:00',
      timeTo: '18:00',
    })

    await field('branchId').setValue('2')
    await flushPromises()
    expect(lastQuery()).not.toHaveProperty('theaterId')
  })

  it('searches by text and clears every filter', async () => {
    await render()
    expect(wrapper!.get('.secondary-button').attributes('disabled')).toBeDefined()
    await field('search').setValue('  odyssey ')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10, search: 'odyssey' })

    await field('status').setValue('INACTIVE')
    await wrapper!.get('.search-bar .secondary-button').trigger('click')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10 })
    expect(field('search').element).toHaveProperty('value', '')
  })

  it.each([
    ['search', 'x'.repeat(101), 'La búsqueda admite como máximo 100 caracteres.'],
    ['dateTo', '2000-01-01', 'La fecha inicial no puede ser posterior a la fecha final.'],
    ['timeTo', '00:00', 'La hora inicial no puede ser posterior a la hora final.'],
  ])('blocks invalid %s values', async (name, value, message) => {
    await render()
    await field('dateFrom').setValue('2099-01-01')
    await field('timeFrom').setValue('10:00')
    getProjections.mockClear()
    await field(name).setValue(value)
    await field(name).trigger('change')
    await wrapper!.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper!.get('.error').text()).toBe(message)
    expect(getProjections).not.toHaveBeenCalled()
  })

  it('distinguishes an empty schedule from filters without matches', async () => {
    getProjections.mockResolvedValue(list({ items: [], total: 0, totalPages: 0 }))
    await render()
    expect(wrapper!.get('.empty-state h2').text()).toBe('No hay proyecciones programadas')
    expect(wrapper!.get('.result-count').text()).toBe('0 proyecciones')
    await field('status').setValue('CANCELLED')
    await flushPromises()
    expect(wrapper!.get('.empty-state h2').text()).toBe(
      'No se encontraron proyecciones con estos criterios',
    )
  })

  it('pages through numbered pages and changes the page size', async () => {
    getProjections.mockResolvedValue(list({ page: 5, totalPages: 10, total: 100 }))
    await render()
    expect(wrapper!.findAll('.pagination-bar nav > *').map((node) => node.text())).toEqual([
      'Anterior',
      '1',
      '…',
      '4',
      '5',
      '6',
      '…',
      '10',
      'Siguiente',
    ])
    expect(wrapper!.get('[aria-current="page"]').text()).toBe('5')
    expect(wrapper!.get('tbody td').text()).toBe('41')

    await wrapper!.get('[aria-label="Página 6"]').trigger('click')
    expect(lastQuery().page).toBe(6)
    await wrapper!.findAll('.pagination-bar nav .secondary-button')[0]!.trigger('click')
    expect(lastQuery().page).toBe(4)
    await wrapper!.findAll('.pagination-bar nav .secondary-button')[1]!.trigger('click')
    expect(lastQuery().page).toBe(6)

    await field('pageSize').setValue(25)
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 25 })
  })

  it.each([
    [500, 'No se pudo cargar la lista de proyecciones, intenta de nuevo.', undefined],
    [403, 'No tienes permisos para realizar esta acción.', 'forbidden'],
  ])('explains list failures (%i) and retries', async (status, message, event) => {
    getProjections.mockRejectedValueOnce(httpError(status))
    await render()
    expect(wrapper!.get('.list-content .error').text()).toContain(message)
    if (event) expect(wrapper!.emitted(event)).toHaveLength(1)
    await wrapper!.get('.list-content .error button').trigger('click')
    await flushPromises()
    expect(wrapper!.find('tbody').exists()).toBe(true)
  })

  it('reports an expired session and failing filter options', async () => {
    getProjections.mockRejectedValueOnce(httpError(401))
    getProjectionFilterOptions.mockRejectedValueOnce(new Error('offline'))
    await render()
    expect(wrapper!.emitted('sessionExpired')).toHaveLength(1)
    expect(wrapper!.get('fieldset').attributes('disabled')).toBeDefined()
    expect(wrapper!.text()).toContain('No se pudieron cargar las opciones de los filtros.')

    await wrapper!.findAll('.error button')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper!.get('fieldset').attributes('disabled')).toBeUndefined()
  })

  it('opens and closes the detail of a row', async () => {
    await render()
    const detail = wrapper!.getComponent(ProjectionDetailDialog)
    expect(detail.props('projectionId')).toBeNull()
    await wrapper!.get('[aria-label="Ver detalle de MF-007"]').trigger('click')
    expect(detail.props('projectionId')).toBe(7)

    detail.vm.$emit('sessionExpired')
    detail.vm.$emit('forbidden')
    detail.vm.$emit('close')
    await flushPromises()
    expect(detail.props('projectionId')).toBeNull()
    expect(wrapper!.emitted('sessionExpired')).toHaveLength(1)
    expect(wrapper!.emitted('forbidden')).toHaveLength(1)
  })

  it('refreshes on demand and ignores outdated answers', async () => {
    let finishFirst!: (value: ProjectionList) => void
    getProjections.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
    await render()
    wrapper!.vm.refresh()
    await flushPromises()
    finishFirst(list({ total: 99 }))
    await flushPromises()
    expect(wrapper!.get('.result-count').text()).toBe('1 proyección')
    expect(getProjectionFilterOptions).toHaveBeenCalledTimes(2)

    getProjections.mockRejectedValueOnce(new Error('late'))
    getProjectionFilterOptions.mockRejectedValueOnce(new Error('late'))
    wrapper!.vm.refresh()
    wrapper!.unmount()
    await flushPromises()
    wrapper = undefined
  })

  it('offers modification only for active or inactive projections', async () => {
    getProjections.mockResolvedValue(
      list({ items: [item, { ...item, movieFunctionId: 8, status: 'ACTIVE' }], total: 2 }),
    )
    await render()
    const cancelled = wrapper!.get('[aria-label="Modificar MF-007"]')
    expect(cancelled.attributes('disabled')).toBeDefined()
    expect(cancelled.attributes('title')).toBe('Solo se modifican proyecciones activas o inactivas')

    const active = wrapper!.get('[aria-label="Modificar MF-008"]')
    expect(active.attributes('title')).toBe('Modificar')
    await active.trigger('click')
    expect(wrapper!.emitted('edit')).toEqual([[8]])
  })
})
