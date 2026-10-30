import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import TransactionsSection from '@/components/transactions/TransactionsSection.vue'
import type { TransactionListItem, TransactionListResult } from '@/types/transaction'

const { getTransactions, getTransactionFilterOptions, sessionExpired, refreshPermissions } =
  vi.hoisted(() => ({
    getTransactions: vi.fn(),
    getTransactionFilterOptions: vi.fn(),
    sessionExpired: vi.fn(),
    refreshPermissions: vi.fn(),
  }))
vi.mock('@/services/transaction.service', () => ({ getTransactions, getTransactionFilterOptions }))
vi.mock('@/composables/useEmployeeSessionRecovery', () => ({
  useEmployeeSessionRecovery: () => ({
    state: { disposed: false },
    sessionExpired,
    refreshPermissions,
  }),
}))

const BRANCH = 'Cinetadel Multiplaza del Este'
const transaction = (
  id: number,
  purchased: string,
  clientName: string,
  movieTitle: string,
  theaterId: number,
  functionStart: string,
  tickets: number,
  total: number,
  status: TransactionListItem['status'],
): TransactionListItem => ({
  id,
  purchasedAt: `${purchased}T10:42`,
  clientName,
  clientEmail: `${clientName.split(' ')[0]!.toLowerCase()}@cinetadel.shop`,
  movieTitle,
  branchName: BRANCH,
  theaterId,
  functionStart,
  tickets,
  total,
  status,
})
// The five invoices of the test plan, newest first.
const transactions: TransactionListItem[] = [
  transaction(125, '2026-10-16', 'Ana Solís', 'La Última Frontera', 2, '2026-10-16T21:00', 1, 3500, 'CANCELLED'),
  transaction(124, '2026-10-14', 'María Rodríguez', 'La Última Frontera', 2, '2026-10-14T21:00', 1, 4500, 'PAID'),
  transaction(123, '2026-10-12', 'Carlos Mora', 'Ecos del Volcán', 1, '2026-10-12T17:00', 1, 3500, 'PAID'),
  transaction(122, '2026-10-10', 'María Rodríguez', 'Ecos del Volcán', 1, '2026-10-10T17:00', 2, 11500, 'CANCELLED'),
  transaction(121, '2026-10-05', 'María Rodríguez', 'La Última Frontera', 2, '2026-10-05T19:30', 2, 7000, 'PAID'),
]
function result(overrides: Partial<TransactionListResult> = {}): TransactionListResult {
  return { items: transactions, total: 5, page: 1, pageSize: 10, totalPages: 1, ...overrides }
}
function failure(status?: number) {
  return new AxiosError(
    'HTTP failure',
    undefined,
    undefined,
    undefined,
    status ? ({ status } as AxiosResponse) : undefined,
  )
}
let wrapper: VueWrapper | undefined

async function render(props: { disabled?: boolean } = {}) {
  wrapper = mount(TransactionsSection, { props })
  await flushPromises()
  return wrapper
}
const lastQuery = () => getTransactions.mock.calls[getTransactions.mock.calls.length - 1]?.[0]
const button = (view: VueWrapper, text: string) =>
  view.findAll('button').find((item) => item.text().includes(text))!
const cells = (view: VueWrapper) =>
  view.findAll('tbody tr').map((row) => row.findAll('td').map((td) => td.text()))

beforeEach(() => {
  getTransactions.mockReset().mockResolvedValue(result())
  getTransactionFilterOptions.mockReset().mockResolvedValue({
    branches: [
      { id: 1, name: BRANCH },
      { id: 25, name: null },
    ],
    movies: [
      { id: 62, title: 'Ecos del Volcán' },
      { id: 63, title: 'La Última Frontera' },
    ],
  })
  sessionExpired.mockReset()
  refreshPermissions.mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('TransactionsSection', () => {
  it('lists the transactions with the columns of the test plan (UT-043)', async () => {
    const view = await render()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10 })
    expect(view.get('h1').text()).toBe('Transacciones')
    expect(view.get('.result-count').text()).toBe('5 transacciones')
    expect(view.findAll('th').map((th) => th.text())).toEqual([
      'IdTransacción',
      'Fecha',
      'Cliente',
      'Película y función',
      'Boletos',
      'Total',
      'Estado',
      'Acciones',
    ])
    const rows = cells(view)
    expect(rows).toHaveLength(5)
    expect(rows[2]).toEqual([
      'FAC-000123',
      '12/10/2026',
      'Carlos Moracarlos@cinetadel.shop',
      `Ecos del Volcán – Sala 1, 12/10/2026 17:00${BRANCH}`,
      '1',
      '₡3500',
      'Pagada',
      'Ver detalle',
    ])
    const third = view.findAll('tbody tr')[2]!
    expect(third.findAll('.primary-text').map((cell) => cell.text())).toEqual([
      'Carlos Mora',
      'Ecos del Volcán – Sala 1, 12/10/2026 17:00',
    ])
    expect(third.findAll('.secondary-text').map((cell) => cell.text())).toEqual([
      'carlos@cinetadel.shop',
      BRANCH,
    ])
    expect(rows.map((row) => [row[0], row[5]])).toEqual([
      ['FAC-000125', '₡3500'],
      ['FAC-000124', '₡4500'],
      ['FAC-000123', '₡3500'],
      ['FAC-000122', '₡11500'],
      ['FAC-000121', '₡7000'],
    ])
  })

  it('shows cancelled transactions as Cancelada (UT-044)', async () => {
    const view = await render()
    expect(cells(view).map((row) => [row[0], row[6]])).toEqual([
      ['FAC-000125', 'Cancelada'],
      ['FAC-000124', 'Pagada'],
      ['FAC-000123', 'Pagada'],
      ['FAC-000122', 'Cancelada'],
      ['FAC-000121', 'Pagada'],
    ])
    expect(view.findAll('.status-badge.cancelled')).toHaveLength(2)
  })

  it('keeps Ver detalle visible in every row but disabled until SCRUM-18', async () => {
    const view = await render()
    const actions = view.findAll('.detail-button')
    expect(actions).toHaveLength(5)
    expect(actions[0]!.attributes('aria-label')).toBe('Ver detalle de FAC-000125 (Pendiente)')
    expect(actions.every((action) => action.attributes('disabled') !== undefined)).toBe(true)
  })

  it('uses the singular for one transaction and names a branch without name', async () => {
    getTransactions.mockResolvedValueOnce(
      result({ items: [{ ...transactions[0]!, branchName: null }], total: 1 }),
    )
    const view = await render()
    expect(view.get('.result-count').text()).toBe('1 transacción')
    expect(view.get('tbody').text()).toContain('Sin nombre registrado')
    expect(view.findAll('select[name="branchId"] option').map((o) => o.text())).toEqual([
      'Todas',
      BRANCH,
      'Sin nombre registrado',
    ])
  })

  it('shows that there are no transactions (UT-046)', async () => {
    getTransactions.mockResolvedValueOnce(result({ items: [], total: 0, totalPages: 0 }))
    const view = await render()
    expect(view.get('.state-card h2').text()).toBe('No hay transacciones disponibles')
    expect(view.find('tbody').exists()).toBe(false)
  })

  it('distinguishes a search without matches', async () => {
    getTransactions.mockResolvedValue(result({ items: [], total: 0, totalPages: 0 }))
    const view = await render()
    await view.get('input[name="search"]').setValue('Nadie')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(view.get('.state-card h2').text()).toBe('No se encontraron transacciones')
  })

  it.each([undefined, 500])(
    'shows the load error without rows and retries (UT-045, status %p)',
    async (status) => {
      getTransactions.mockRejectedValueOnce(failure(status))
      const view = await render()
      expect(view.get('[role="alert"] h2').text()).toBe(
        'No se pudieron cargar las transacciones, intenta de nuevo',
      )
      expect(view.find('tbody').exists()).toBe(false)
      expect(view.find('.pagination-bar').exists()).toBe(false)
      await button(view, 'Reintentar').trigger('click')
      await flushPromises()
      expect(view.findAll('tbody tr')).toHaveLength(5)
    },
  )

  it('answers 403 with the permission message and rechecks the session', async () => {
    getTransactions.mockRejectedValueOnce(failure(403))
    const view = await render()
    expect(view.get('[role="alert"] h2').text()).toBe(
      'No tiene permisos para acceder a esta sección',
    )
    expect(view.find('tbody').exists()).toBe(false)
    expect(refreshPermissions).toHaveBeenCalled()
  })

  it('leaves the dashboard when the session expired', async () => {
    getTransactions.mockRejectedValueOnce(failure(401))
    await render()
    expect(sessionExpired).toHaveBeenCalled()
  })

  it('shows a 400 answer as invalid filters', async () => {
    getTransactions.mockRejectedValueOnce(failure(400))
    const view = await render()
    expect(view.get('[role="alert"] h2').text()).toBe('La búsqueda o los filtros no son válidos')
  })

  it('searches by ID, client or movie, normalizing spaces, and clears the filters', async () => {
    const view = await render()
    expect(button(view, 'Limpiar filtros').attributes('disabled')).toBeDefined()
    await view.get('input[name="search"]').setValue('  María   Rodríguez ')
    await view.get('form').trigger('submit')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10, search: 'María Rodríguez' })

    await button(view, 'Limpiar filtros').trigger('click')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 10 })
    expect(view.get<HTMLInputElement>('input[name="search"]').element.value).toBe('')
  })

  it.each([
    ['   ', 'La búsqueda no puede contener solo espacios.'],
    ['FAC\u0007', 'La búsqueda contiene caracteres no válidos.'],
    ['a'.repeat(101), 'La búsqueda no puede superar 100 caracteres.'],
  ])('rejects the search %p without asking the API', async (search, message) => {
    const view = await render()
    const calls = getTransactions.mock.calls.length
    await view.get('input[name="search"]').setValue(search)
    await view.get('form').trigger('submit')
    expect(view.get('.feedback').text()).toBe(message)
    expect(getTransactions.mock.calls.length).toBe(calls)
  })

  it('does not search while the dashboard is busy', async () => {
    const view = await render({ disabled: true })
    const calls = getTransactions.mock.calls.length
    await view.get('form').trigger('submit')
    expect(getTransactions.mock.calls.length).toBe(calls)
  })

  it('filters by branch, movie, status and purchase dates', async () => {
    const view = await render()
    await view.get('select[name="branchId"]').setValue('1')
    await view.get('select[name="movieId"]').setValue('62')
    await view.get('select[name="status"]').setValue('CANCELLED')
    await view.get('input[name="dateFrom"]').setValue('2026-10-05')
    await view.get('input[name="dateTo"]').setValue('2026-10-16')
    await flushPromises()
    expect(lastQuery()).toEqual({
      page: 1,
      pageSize: 10,
      branchId: 1,
      movieId: 62,
      status: 'CANCELLED',
      dateFrom: '2026-10-05',
      dateTo: '2026-10-16',
    })
    expect(view.findAll('select[name="status"] option').map((o) => o.text())).toEqual([
      'Todos',
      'Pagada',
      'Cancelada',
    ])
  })

  it('rejects a start date after the end date without asking the API', async () => {
    const view = await render()
    await view.get('input[name="dateTo"]').setValue('2026-10-05')
    await flushPromises()
    const calls = getTransactions.mock.calls.length
    await view.get('input[name="dateFrom"]').setValue('2026-10-16')
    await flushPromises()
    expect(getTransactions.mock.calls.length).toBe(calls)
    expect(view.get('.feedback').text()).toBe(
      'La fecha de inicio no puede ser posterior a la fecha de fin.',
    )
    expect(view.find('tbody').exists()).toBe(false)
    expect(view.get('input[name="dateFrom"]').attributes('aria-invalid')).toBe('true')
  })

  it('disables the branch and movie filters when the options fail and retries them', async () => {
    getTransactionFilterOptions.mockRejectedValueOnce(failure(500))
    const view = await render()
    expect(view.get('select[name="branchId"]').attributes('disabled')).toBeDefined()
    expect(view.get('select[name="movieId"]').attributes('disabled')).toBeDefined()
    expect(view.get('.filter-error').text()).toContain('No se pudieron cargar los filtros.')
    await view.get('.filter-error button').trigger('click')
    await flushPromises()
    expect(view.find('.filter-error').exists()).toBe(false)
    expect(view.findAll('select[name="movieId"] option')).toHaveLength(3)
  })

  it('pages forward and back and changes the page size', async () => {
    getTransactions.mockResolvedValue(result({ total: 25, totalPages: 3 }))
    const view = await render()
    await button(view, 'Siguiente').trigger('click')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ page: 2 })
    getTransactions.mockResolvedValue(result({ page: 2, total: 25, totalPages: 3 }))
    await button(view, 'Siguiente').trigger('click')
    await flushPromises()
    await button(view, 'Anterior').trigger('click')
    await flushPromises()
    expect(lastQuery()).toMatchObject({ page: 1 })
    await view.get('select[name="pageSize"]').setValue('50')
    await flushPromises()
    expect(lastQuery()).toEqual({ page: 1, pageSize: 50 })
  })

  it('does not page past the last page', async () => {
    const view = await render()
    const calls = getTransactions.mock.calls.length
    expect(button(view, 'Siguiente').attributes('disabled')).toBeDefined()
    expect(button(view, 'Anterior').attributes('disabled')).toBeDefined()
    await button(view, 'Siguiente').trigger('click')
    await button(view, 'Anterior').trigger('click')
    expect(getTransactions.mock.calls.length).toBe(calls)
  })

  it('ignores an answer that arrives after a newer request', async () => {
    let first!: (value: TransactionListResult) => void
    getTransactions
      .mockReturnValueOnce(new Promise((resolve) => (first = resolve)))
      .mockResolvedValueOnce(result({ items: [transactions[2]!], total: 1 }))
    const view = await render()
    await view.get('select[name="status"]').setValue('PAID')
    await flushPromises()
    first(result())
    await flushPromises()
    expect(view.findAll('tbody tr')).toHaveLength(1)
  })

  it('ignores answers that arrive after leaving the section', async () => {
    let list!: (value: TransactionListResult) => void
    let options!: (value: unknown) => void
    getTransactions.mockReturnValueOnce(new Promise((resolve) => (list = resolve)))
    getTransactionFilterOptions.mockReturnValueOnce(new Promise((resolve) => (options = resolve)))
    const view = mount(TransactionsSection)
    view.unmount()
    list(result())
    options({ branches: [], movies: [] })
    await flushPromises()
    expect(sessionExpired).not.toHaveBeenCalled()
  })

  it('ignores failures that arrive after leaving the section', async () => {
    let list!: (error: unknown) => void
    let options!: (error: unknown) => void
    getTransactions.mockReturnValueOnce(new Promise((_, reject) => (list = reject)))
    getTransactionFilterOptions.mockReturnValueOnce(new Promise((_, reject) => (options = reject)))
    const view = mount(TransactionsSection)
    view.unmount()
    list(failure(401))
    options(failure(401))
    await flushPromises()
    expect(sessionExpired).not.toHaveBeenCalled()
  })
})
