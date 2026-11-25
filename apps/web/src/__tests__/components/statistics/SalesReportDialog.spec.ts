import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import SalesReportDialog from '@/components/statistics/SalesReportDialog.vue'
import SalesPeriodFilter from '@/components/statistics/SalesPeriodFilter.vue'
import NotificationPopup from '@/components/common/NotificationPopup.vue'
import { downloadSalesReport } from '@/services/sales-report.service'

vi.mock('@/services/sales-report.service', () => ({
  downloadSalesReport: vi.fn(),
  SALES_REPORT_ERROR: 'No se pudo generar el reporte, intenta de nuevo',
}))
let view: VueWrapper
const page = new DOMWrapper(document.body)
const initialPeriod = { dateFrom: '2026-11-01', dateTo: '2026-11-21' }
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-11-23T12:00:00-06:00'))
  Object.defineProperties(HTMLDialogElement.prototype, {
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
  vi.mocked(downloadSalesReport).mockReset().mockResolvedValue('downloaded')
})
afterEach(() => {
  view?.unmount()
  for (const [key, value] of [
    ['showModal', originalShow],
    ['close', originalClose],
  ] as const) {
    if (value) Object.defineProperty(HTMLDialogElement.prototype, key, value)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
  }
  vi.restoreAllMocks()
  vi.useRealTimers()
})
const render = () => {
  view = mount(SalesReportDialog, { props: { initialPeriod } })
  return view
}

describe('SalesReportDialog', () => {
  it('reuses the shared modal and period controls without generating on open or preset changes', async () => {
    render()
    expect(page.get('dialog').element.open).toBe(true)
    expect(page.get('h2').text()).toBe('Generar reporte de ventas')
    expect(page.get('button[type="submit"]').text()).toBe('Descargar reporte')
    expect(page.find('button[type="submit"] .bi-download').exists()).toBe(true)
    const period = view.getComponent(SalesPeriodFilter)
    expect(period.props()).toMatchObject({
      initialPeriod,
      autoApply: false,
      alwaysShowSubmit: true,
      surface: 'light',
    })
    await page.get('select').setValue('last7days')
    expect(downloadSalesReport).not.toHaveBeenCalled()
    expect(
      page
        .findAll('input[type="checkbox"]')
        .every((input) => (input.element as HTMLInputElement).checked),
    ).toBe(true)
  })
  it('uses current validated dates and appendix choices only on download', async () => {
    render()
    await page.get('input[type="checkbox"]').setValue(false)
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(downloadSalesReport).toHaveBeenCalledWith(
      initialPeriod,
      { dataAppendix: false, notesAppendix: true },
      expect.any(AbortSignal),
    )
    expect(view.emitted('downloaded')).toHaveLength(1)
    expect(view.emitted('close')).toHaveLength(1)
  })
  it('validates before requesting and lets cancellation close an invalid form immediately', async () => {
    render()
    const period = view.getComponent(SalesPeriodFilter)
    const pickers = period.findAllComponents({ name: 'DatePicker' })
    pickers[0]!.vm.$emit('update:modelValue', '')
    await page.get('form').trigger('submit')
    expect(page.get('.filter-error').text()).toContain('fecha de inicio y la fecha de fin')
    expect(downloadSalesReport).not.toHaveBeenCalled()
    await page.get('.secondary-button').trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
  })
  it.each([0, 1])('blocks report generation when date field %i is in the future', async (index) => {
    render()
    const pickers = view.getComponent(SalesPeriodFilter).findAllComponents({ name: 'DatePicker' })
    expect(pickers[index]!.props('max')).toBe('2026-11-23')
    pickers[index]!.vm.$emit('update:modelValue', '2026-11-24')
    await page.get('form').trigger('submit')
    expect(page.get('.filter-error').text()).toBe(
      'Las fechas del periodo no pueden ser posteriores a hoy.',
    )
    expect(downloadSalesReport).not.toHaveBeenCalled()
    await page.get('.secondary-button').trigger('click')
    expect(view.emitted('close')).toHaveLength(1)
  })
  it('shows loading, blocks duplicates and aborts on close without a late success message', async () => {
    let resolve!: (result: 'downloaded') => void
    vi.mocked(downloadSalesReport).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    render()
    await page.get('form').trigger('submit')
    expect(page.get('.loading-state').text()).toContain('Generando reporte')
    expect(page.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await page.get('form').trigger('submit')
    expect(downloadSalesReport).toHaveBeenCalledTimes(1)
    const signal = vi.mocked(downloadSalesReport).mock.calls[0]![2]
    await page.get('.app-modal-close').trigger('click')
    expect(signal.aborted).toBe(true)
    resolve('downloaded')
    await flushPromises()
    expect(view.emitted('downloaded')).toBeUndefined()
  })
  it('warns about empty periods and lets errors be retried without losing dates', async () => {
    vi.mocked(downloadSalesReport)
      .mockResolvedValueOnce('empty')
      .mockRejectedValueOnce(new Error('Internal error'))
    render()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(view.getComponent(NotificationPopup).props()).toMatchObject({
      type: 'alert',
      placement: 'bottom-right',
      message: 'No se encontraron ventas para el periodo seleccionado.',
    })
    view.getComponent(NotificationPopup).vm.$emit('close')
    await flushPromises()
    expect(view.findComponent(NotificationPopup).exists()).toBe(false)
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(view.getComponent(NotificationPopup).props()).toMatchObject({
      type: 'error',
      message: 'No se pudo generar el reporte, intenta de nuevo',
    })
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(downloadSalesReport).toHaveBeenLastCalledWith(
      initialPeriod,
      expect.any(Object),
      expect.any(AbortSignal),
    )
    expect(view.emitted('downloaded')).toHaveLength(1)
  })
  it('reports session expiry and ignores a cancelled failure after unmount', async () => {
    vi.mocked(downloadSalesReport).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    })
    render()
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(view.emitted('session-expired')).toHaveLength(1)
    expect(view.findComponent(NotificationPopup).exists()).toBe(false)
    view.unmount()
    let reject!: (error: Error) => void
    vi.mocked(downloadSalesReport).mockReturnValueOnce(
      new Promise((_done, fail) => {
        reject = fail
      }),
    )
    render()
    await page.get('form').trigger('submit')
    const calls = vi.mocked(downloadSalesReport).mock.calls
    const signal = calls[calls.length - 1]![2]
    view.unmount()
    reject(new Error('Aborted'))
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(view.emitted('downloaded')).toBeUndefined()
  })
})
