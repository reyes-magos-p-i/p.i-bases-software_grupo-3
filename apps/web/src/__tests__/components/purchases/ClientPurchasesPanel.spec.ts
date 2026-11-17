import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ClientPurchasesPanel from '@/components/purchases/ClientPurchasesPanel.vue'
import PurchaseDetailDialog from '@/components/purchases/PurchaseDetailDialog.vue'
import DatePicker from '@/components/common/DatePicker.vue'
import { getMyPurchases } from '@/services/purchase.service'
import { establishClientSession, clearClientSession } from '@/services/client-session.service'
import type { PurchaseList } from '@/types/purchase'
import panelSource from '@/components/purchases/ClientPurchasesPanel.vue?raw'
import { contrastRatio, cssValue } from '../../helpers/contrast'

vi.mock('@/facebook-auth', () => ({ fbAuth: { status: 'unknown' }, logoutFromFacebook: vi.fn() }))
vi.mock('@/services/purchase.service', () => ({
  getMyPurchases: vi.fn(),
  getMyPurchase: vi.fn(),
}))

const stubs = { PurchaseDetailDialog: true }
const purchase = (id: number, date: string, total: number, status: 'PAID' | 'CANCELLED') => ({
  id,
  reference: `ORD-${String(id).padStart(6, '0')}`,
  title: 'Ecos del Volcán',
  purchasedAt: `${date}T10:42:00-06:00`,
  startsAt: `${date}T20:00:00-06:00`,
  status,
  total,
  quantity: 2,
  functionCancelled: false,
})
const history: PurchaseList = {
  items: [
    purchase(124, '2026-10-14', 4500, 'PAID'),
    purchase(122, '2026-10-10', 11500, 'CANCELLED'),
    purchase(121, '2026-10-05', 7000, 'PAID'),
  ],
  page: 1,
  total: 3,
  totalPages: 1,
}
const empty: PurchaseList = { items: [], page: 1, total: 0, totalPages: 0 }
let wrapper: ReturnType<typeof mount>

async function render() {
  wrapper = mount(ClientPurchasesPanel, { global: { stubs } })
  await flushPromises()
}
async function fillFilters(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    if (name === 'search') await wrapper.get(`input[name="${name}"]`).setValue(value)
    else {
      const picker = wrapper
        .findAllComponents(DatePicker)
        .find((item) => item.get('input').attributes('name') === name)!
      picker.vm.$emit('update:modelValue', value)
      await flushPromises()
    }
  }
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  establishClientSession(
    { id: 8, email: 'a@example.com', firstName: 'Ana', lastName: 'Rojas' },
    'token',
  )
  vi.mocked(getMyPurchases).mockResolvedValue(history)
})
afterEach(() => {
  wrapper?.unmount()
  clearClientSession()
})

describe('ClientPurchasesPanel', () => {
  it('keeps calendar dates as drafts until the filters are submitted', async () => {
    await render()
    const picker = wrapper.findAllComponents(DatePicker)[0]!
    await picker.get('input').trigger('click')
    const day = picker.get('[data-date]:not(:disabled)')
    const value = day.attributes('data-date')
    await day.trigger('click')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenCalledTimes(1)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenLastCalledWith(
      { page: 1, dateFrom: value },
      expect.any(AbortSignal),
    )
    await picker.get('input').trigger('click')
    await picker.get('.calendar-footer button').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenLastCalledWith({ page: 1 }, expect.any(AbortSignal))
  })

  it('lists date, order, total and status in the order the API returns (UT-058, 059, 061)', async () => {
    await render()
    expect(getMyPurchases).toHaveBeenCalledExactlyOnceWith({ page: 1 }, expect.any(AbortSignal))
    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('14/10/2026')
    expect(rows[0]).toContain('ORD-000124')
    expect(rows[1]).toContain('₡11500')
    expect(rows[1]).toContain('Cancelada')
    expect(rows[2]).toContain('ORD-000121')
    expect(rows[2]).toContain('Pagada')
    expect(wrapper.text()).toContain('3 compras · de la más reciente a la más antigua')
  })

  it('marks purchases whose function was cancelled', async () => {
    vi.mocked(getMyPurchases).mockResolvedValue({
      ...history,
      items: [{ ...history.items[0]!, functionCancelled: true }, history.items[1]!],
      total: 2,
    })
    await render()
    const rows = wrapper.findAll('tbody tr').map((row) => row.text())
    expect(rows[0]).toContain('Función cancelada')
    expect(rows[1]).not.toContain('Función cancelada')
    const [cancelledRow, activeRow] = wrapper.findAll('tbody tr')
    expect(cancelledRow!.find('.function-cancelled').text()).toBe('Función cancelada')
    // The red style only exists on the cancelled label, so an active purchase has no red text.
    expect(activeRow!.find('.function-cancelled').exists()).toBe(false)
  })

  it('shows "Función cancelada" in red with at least 4.5:1 on every table row background', () => {
    const color = cssValue(panelSource, '.function-cancelled', 'color')
    expect(color).toBe('var(--error-text)')
    for (const background of [
      '--table-background',
      '--table-stripe-background',
      '--table-hover-background',
    ]) {
      expect(contrastRatio(color, `var(${background})`)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uses the singular for one purchase', async () => {
    vi.mocked(getMyPurchases).mockResolvedValue({
      ...history,
      items: [history.items[0]!],
      total: 1,
    })
    await render()
    expect(wrapper.text()).toContain('1 compra ·')
  })

  it('sends the partial order number and the date range (UT-062, 064)', async () => {
    await render()
    await fillFilters({ search: ' 0122 ', dateFrom: '2026-10-05', dateTo: '2026-10-10' })
    expect(getMyPurchases).toHaveBeenLastCalledWith(
      { page: 1, search: '0122', dateFrom: '2026-10-05', dateTo: '2026-10-10' },
      expect.any(AbortSignal),
    )
  })

  it('offers both actions of the test plan on the same form', async () => {
    await render()
    const actions = wrapper.findAll('button[type="submit"]').map((button) => button.text())
    expect(actions).toEqual(['Buscar', 'Filtrar'])
  })

  it('alerts about an inverted range and keeps the list unfiltered (UT-067)', async () => {
    await render()
    await fillFilters({ dateFrom: '2026-10-14', dateTo: '2026-10-05' })
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'La fecha inicial no puede ser posterior a la fecha final',
    )
    expect(getMyPurchases).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
  })

  it('tells an empty account from a filter without results (UT-070, 071, 072)', async () => {
    vi.mocked(getMyPurchases).mockResolvedValue(empty)
    await render()
    expect(wrapper.text()).toContain('Aún no tienes compras registradas')
    expect(wrapper.find('table').exists()).toBe(false)
    await fillFilters({ search: 'ORD-000123' })
    expect(wrapper.text()).toContain('No se encontraron compras con ese criterio')
    expect(wrapper.text()).not.toContain('Aún no tienes compras registradas')
  })

  it('clears the filters and the alert', async () => {
    await render()
    await fillFilters({ dateFrom: '2026-10-14', dateTo: '2026-10-05' })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Limpiar')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect((wrapper.get('input[name="dateFrom"]').element as HTMLInputElement).value).toBe('')
    expect(getMyPurchases).toHaveBeenLastCalledWith({ page: 1 }, expect.any(AbortSignal))
  })

  it('hides the list when it fails to load and retries the same page (UT-074)', async () => {
    await render()
    vi.mocked(getMyPurchases).mockRejectedValueOnce(new Error('offline'))
    await fillFilters({ search: '0122' })
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'No se pudo cargar el historial de compras, intenta de nuevo',
    )
    expect(wrapper.find('table').exists()).toBe(false)
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenLastCalledWith(
      { page: 1, search: '0122' },
      expect.any(AbortSignal),
    )
    expect(wrapper.find('table').exists()).toBe(true)
  })

  it('retries the first page when nothing has loaded yet', async () => {
    vi.mocked(getMyPurchases).mockRejectedValueOnce(new Error('offline'))
    await render()
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenLastCalledWith({ page: 1 }, expect.any(AbortSignal))
  })

  it('paginates keeping the applied filters', async () => {
    vi.mocked(getMyPurchases).mockResolvedValue({ ...history, total: 11, totalPages: 2 })
    await render()
    await fillFilters({ search: '00012' })
    expect(wrapper.get('[aria-label="Página anterior"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="Página siguiente"]').trigger('click')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenLastCalledWith(
      { page: 2, search: '00012' },
      expect.any(AbortSignal),
    )
    vi.mocked(getMyPurchases).mockResolvedValue({ ...history, page: 2, total: 11, totalPages: 2 })
    await wrapper.get('[aria-label="Página siguiente"]').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="Página anterior"]').trigger('click')
    await flushPromises()
    expect(getMyPurchases).toHaveBeenLastCalledWith(
      { page: 1, search: '00012' },
      expect.any(AbortSignal),
    )
  })

  it('asks to open a purchase and passes the selected one to the dialog (UT-060)', async () => {
    await render()
    await wrapper.get('[aria-label="Ver detalle de ORD-000121"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[121]])
    await wrapper.setProps({ purchaseId: 121 })
    const dialog = wrapper.getComponent(PurchaseDetailDialog)
    expect(dialog.props('purchaseId')).toBe(121)
    dialog.vm.$emit('close')
    expect(wrapper.emitted('select')?.[1]).toEqual([null])
  })

  it('reports expired sessions from the list and from the dialog', async () => {
    vi.mocked(getMyPurchases).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    })
    await render()
    expect(wrapper.emitted('sessionExpired')).toHaveLength(1)
    wrapper.getComponent(PurchaseDetailDialog).vm.$emit('session-expired')
    expect(wrapper.emitted('sessionExpired')).toHaveLength(2)
  })

  it('ignores a late answer after logout', async () => {
    let resolve!: (value: PurchaseList) => void
    let reject!: (reason: unknown) => void
    vi.mocked(getMyPurchases).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    await render()
    clearClientSession()
    resolve(history)
    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(false)
    establishClientSession(
      { id: 8, email: 'a@example.com', firstName: 'Ana', lastName: 'Rojas' },
      'token',
    )
    vi.mocked(getMyPurchases).mockReturnValueOnce(new Promise((_, fail) => (reject = fail)))
    await fillFilters({ search: '1' })
    clearClientSession()
    reject(new Error('offline'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('aborts the pending request when it closes', async () => {
    vi.mocked(getMyPurchases).mockReturnValueOnce(new Promise(() => undefined))
    await render()
    const signal = vi.mocked(getMyPurchases).mock.calls[0]![1]!
    wrapper.unmount()
    expect(signal.aborted).toBe(true)
  })
})
