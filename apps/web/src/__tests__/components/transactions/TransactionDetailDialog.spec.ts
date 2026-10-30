import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse } from 'axios'
import TransactionDetailDialog from '@/components/transactions/TransactionDetailDialog.vue'
import type { TransactionDetail } from '@/types/transaction'

const { getTransaction } = vi.hoisted(() => ({ getTransaction: vi.fn() }))
vi.mock('@/services/transaction.service', () => ({ getTransaction }))

const page = new DOMWrapper(document.body)
const prototype = HTMLDialogElement.prototype
const originalShow = Object.getOwnPropertyDescriptor(prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(prototype, 'close')
let wrapper: VueWrapper<InstanceType<typeof TransactionDetailDialog>> | undefined

const fac123: TransactionDetail = {
  id: 123,
  purchasedAt: '2026-10-12T10:42',
  clientName: 'Carlos Mora',
  clientEmail: 'cliente2.pruebas@cinetadel.shop',
  movieTitle: 'Ecos del Volcán',
  branchName: 'Cinetadel Multiplaza del Este',
  theaterId: 1,
  functionStart: '2026-10-12T17:00',
  tickets: 1,
  total: 3500,
  status: 'PAID',
  paymentMethod: 'CARD',
  cardBrand: 'mastercard',
  cardLast4: '4444',
  lines: [
    {
      productId: 1,
      name: 'Boleto general',
      type: 'TICKET',
      quantity: 1,
      unitPrice: 3500,
      subtotal: 3500,
    },
  ],
}
const fac124: TransactionDetail = {
  ...fac123,
  id: 124,
  purchasedAt: '2026-10-14T10:42',
  clientName: 'María Rodríguez',
  clientEmail: 'cliente.pruebas@cinetadel.shop',
  movieTitle: 'La Última Frontera',
  theaterId: 2,
  functionStart: '2026-10-14T21:00',
  total: 4500,
  cardBrand: 'visa',
  cardLast4: '4242',
  lines: [
    fac123.lines[0]!,
    {
      productId: 3,
      name: 'Refresco mediano',
      type: 'FOOD',
      quantity: 1,
      unitPrice: 1000,
      subtotal: 1000,
    },
  ],
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
function field(label: string) {
  const element = page.findAll('.detail-field').find((item) => item.get('dt').text() === label)
  if (!element) throw new Error('Missing field: ' + label)
  return element.get('dd').text()
}
async function render(transactionId: number | null = 123) {
  wrapper = mount(TransactionDetailDialog, { props: { transactionId }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  getTransaction.mockReset().mockResolvedValue(fac123)
  Object.defineProperties(prototype, {
    showModal: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = true
      }),
    },
    close: {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.open = false
      }),
    },
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  for (const [key, descriptor] of [
    ['showModal', originalShow],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(prototype, key, descriptor)
    else Reflect.deleteProperty(prototype, key)
  }
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

describe('TransactionDetailDialog', () => {
  it('stays closed without a selected transaction', async () => {
    await render(null)
    expect(getTransaction).not.toHaveBeenCalled()
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(false)
  })

  it('shows the fields of the selected transaction (UT-052)', async () => {
    await render()
    expect(getTransaction).toHaveBeenCalledWith(123, expect.any(AbortSignal))
    expect(page.get<HTMLDialogElement>('dialog').element.open).toBe(true)
    expect(page.get('.app-modal-title').text()).toBe('Detalle de transacción')
    expect(field('IdTransacción')).toBe('FAC-000123')
    expect(field('Fecha')).toBe('12/10/2026')
    expect(field('Hora de compra')).toBe('10:42')
    expect(field('Cliente')).toBe('Carlos Mora')
    expect(field('Correo electrónico')).toBe('cliente2.pruebas@cinetadel.shop')
    expect(field('Película y función')).toBe('Ecos del Volcán – Sala 1, 12/10/2026 17:00')
    expect(field('Sucursal')).toBe('Cinetadel Multiplaza del Este')
    expect(field('Boletos')).toBe('1')
    expect(field('Total')).toBe('₡3500')
    expect(field('Estado')).toBe('Pagada')
    expect(field('Método de pago')).toBe('Tarjeta Mastercard terminada en 4444')
  })

  it('lists the products with their quantity, unit price and subtotal', async () => {
    getTransaction.mockResolvedValueOnce(fac124)
    await render(124)
    const rows = page
      .findAll('.products-table tbody tr')
      .map((row) => row.findAll('td').map((cell) => cell.text()))
    expect(rows).toEqual([
      ['Boleto general', '1', '₡3500', '₡3500'],
      ['Refresco mediano', '1', '₡1000', '₡1000'],
    ])
    expect(page.get('.products-table tfoot').text()).toBe('Total₡4500')
  })

  it('shows a cancelled transaction and a branch without name', async () => {
    getTransaction.mockResolvedValueOnce({ ...fac123, status: 'CANCELLED', branchName: null })
    await render()
    expect(field('Estado')).toBe('Cancelada')
    expect(field('Sucursal')).toBe('Sin nombre registrado')
  })

  it('shows only the newly selected transaction (UT-057)', async () => {
    const view = await render()
    let resolve!: (value: TransactionDetail) => void
    getTransaction.mockReturnValueOnce(new Promise((done) => (resolve = done)))
    await view.setProps({ transactionId: null })
    await view.setProps({ transactionId: 124 })
    expect(page.text()).not.toContain('Carlos Mora')
    expect(page.text()).not.toContain('FAC-000123')
    resolve(fac124)
    await flushPromises()
    expect(field('IdTransacción')).toBe('FAC-000124')
    expect(field('Cliente')).toBe('María Rodríguez')
    expect(field('Total')).toBe('₡4500')
    expect(page.text()).not.toContain('Carlos Mora')
  })

  it('ignores an answer for a transaction that is no longer selected', async () => {
    let first!: (value: TransactionDetail) => void
    getTransaction
      .mockReturnValueOnce(new Promise((done) => (first = done)))
      .mockResolvedValueOnce(fac124)
    const view = await render()
    await view.setProps({ transactionId: 124 })
    await flushPromises()
    first(fac123)
    await flushPromises()
    expect(field('IdTransacción')).toBe('FAC-000124')
  })

  it.each([undefined, 500])(
    'shows the load error without data and retries (UT-053, status %p)',
    async (status) => {
      getTransaction.mockRejectedValueOnce(failure(status))
      const view = await render(124)
      expect(page.get('[role="alert"] p').text()).toBe(
        'No se pudo cargar el detalle, intenta de nuevo',
      )
      expect(page.find('.detail-group').exists()).toBe(false)
      getTransaction.mockResolvedValueOnce(fac124)
      await page.get('[role="alert"] button').trigger('click')
      await flushPromises()
      expect(field('IdTransacción')).toBe('FAC-000124')
      expect(view.emitted('missing')).toBeUndefined()
    },
  )

  it('reports a transaction that no longer exists (UT-054)', async () => {
    getTransaction.mockRejectedValueOnce(failure(404))
    const view = await render(125)
    expect(page.get('[role="alert"] p').text()).toBe(
      'No fue posible cargar el detalle de la transacción',
    )
    expect(page.find('[role="alert"] button').exists()).toBe(false)
    expect(page.find('.detail-group').exists()).toBe(false)
    expect(view.emitted('missing')).toHaveLength(1)
  })

  it('asks the section to recheck permissions on 403', async () => {
    getTransaction.mockRejectedValueOnce(failure(403))
    const view = await render()
    expect(page.get('[role="alert"] p').text()).toBe(
      'No tiene permisos para acceder a esta sección',
    )
    expect(view.emitted('forbidden')).toHaveLength(1)
  })

  it('reports an expired session on 401', async () => {
    getTransaction.mockRejectedValueOnce(failure(401))
    const view = await render()
    expect(view.emitted('session-expired')).toHaveLength(1)
  })

  it('shows the loading state and closes', async () => {
    getTransaction.mockReturnValueOnce(new Promise(() => {}))
    const view = await render()
    expect(page.get('[role="status"]').text()).toBe('Cargando el detalle…')
    await page.findAll('button').find((button) => button.text() === 'Cerrar')!.trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
  })

  it('ignores a failure that arrives after closing', async () => {
    let reject!: (error: unknown) => void
    getTransaction.mockReturnValueOnce(new Promise((_, fail) => (reject = fail)))
    const view = await render()
    await view.setProps({ transactionId: null })
    reject(failure(401))
    await flushPromises()
    expect(view.emitted('session-expired')).toBeUndefined()
  })
})
