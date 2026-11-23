import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { downloadSalesReport, SALES_REPORT_ERROR } from '@/services/sales-report.service'
import { getSalesStatistics } from '@/services/sales-statistics.service'
import { salesStatistics } from '../helpers/sales-statistics'

vi.mock('@/services/sales-statistics.service', () => ({ getSalesStatistics: vi.fn() }))
class TestWorker {
  static instances: TestWorker[] = []
  static postFailure = false
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn<(request: unknown) => void>(() => {
    if (TestWorker.postFailure) throw new Error('Data clone failed')
  })
  terminate = vi.fn()
  constructor() {
    TestWorker.instances.push(this)
  }
}
const query = { dateFrom: '2026-11-01', dateTo: '2026-11-21' }
const options = { dataAppendix: true, notesAppendix: true }
const pdf = () => {
  const buffer = new ArrayBuffer(8)
  new Uint8Array(buffer).set([37, 80, 68, 70, 45, 49, 46, 55])
  return buffer
}
let createUrl: ReturnType<typeof vi.fn<(value: Blob | MediaSource) => string>>,
  revoke: ReturnType<typeof vi.fn<(url: string) => void>>,
  click: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.mocked(getSalesStatistics).mockReset().mockResolvedValue(salesStatistics())
  TestWorker.instances = []
  TestWorker.postFailure = false
  vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#020617' }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    getImageData: () => ({ data: new Uint8ClampedArray([2, 6, 23, 255]) }),
  } as unknown as CanvasRenderingContext2D)
  createUrl = vi.fn(() => 'blob:report')
  revoke = vi.fn()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl
      static revokeObjectURL = revoke
    },
  )
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('sales report service', () => {
  it('fetches a fresh complete cohort, transfers options and downloads one complete PDF', async () => {
    const controller = new AbortController()
    const pending = downloadSalesReport(
      { ...query, minAge: 18 } as typeof query,
      options,
      controller.signal,
    )
    await flushPromises()
    const worker = TestWorker.instances[0]!
    expect(getSalesStatistics).toHaveBeenCalledWith(query, controller.signal)
    expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({
      statistics: salesStatistics(),
      options,
      palette: { ink: '#020617' },
    })
    worker.onmessage!(new MessageEvent('message', { data: { ok: true, buffer: pdf() } }))
    expect(await pending).toBe('downloaded')
    expect(createUrl).toHaveBeenCalledOnce()
    expect((createUrl.mock.calls[0]![0] as Blob).type).toBe('application/pdf')
    expect(click).toHaveBeenCalledOnce()
    expect(click.mock.instances[0]!.download).toBe('Cinetadel-ventas-2026-11-01-2026-11-21.pdf')
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60000)
    expect(revoke).toHaveBeenCalledWith('blob:report')
  })
  it('reports an empty period without starting a PDF worker or downloading', async () => {
    const data = salesStatistics()
    data.summary.purchases = 0
    vi.mocked(getSalesStatistics).mockResolvedValueOnce(data)
    expect(await downloadSalesReport(query, options, new AbortController().signal)).toBe('empty')
    expect(TestWorker.instances).toHaveLength(0)
    expect(click).not.toHaveBeenCalled()
  })
  it('validates dates before calling the API and preserves authentication failures', async () => {
    await expect(
      downloadSalesReport({ ...query, dateTo: '' }, options, new AbortController().signal),
    ).rejects.toThrow('fecha de inicio y la fecha de fin')
    expect(getSalesStatistics).not.toHaveBeenCalled()
    const failure = { response: { status: 401 } }
    vi.mocked(getSalesStatistics).mockRejectedValueOnce(failure)
    await expect(downloadSalesReport(query, options, new AbortController().signal)).rejects.toBe(
      failure,
    )
    expect(TestWorker.instances).toHaveLength(0)
  })
  it('can cancel before fetching or while a request is pending', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(downloadSalesReport(query, options, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(getSalesStatistics).not.toHaveBeenCalled()
    const current = new AbortController()
    let finish!: (data: ReturnType<typeof salesStatistics>) => void
    vi.mocked(getSalesStatistics).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const pending = downloadSalesReport(query, options, current.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    current.abort()
    finish(salesStatistics())
    await rejected
    expect(TestWorker.instances).toHaveLength(0)
  })
  it('terminates a cancelled worker and prevents a late PDF from downloading', async () => {
    const controller = new AbortController()
    const pending = downloadSalesReport(query, options, controller.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await flushPromises()
    const worker = TestWorker.instances[0]!
    controller.abort()
    worker.onmessage!(new MessageEvent('message', { data: { ok: true, buffer: pdf() } }))
    await rejected
    expect(worker.terminate).toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })
  it('checks cancellation again when the completed PDF returns', async () => {
    const controller = new AbortController()
    const pending = downloadSalesReport(query, options, controller.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await flushPromises()
    TestWorker.instances[0]!.onmessage!(
      new MessageEvent('message', { data: { ok: true, buffer: pdf() } }),
    )
    controller.abort()
    await rejected
    expect(click).not.toHaveBeenCalled()
  })
  it.each(['worker', 'message', 'rejected', 'short', 'signature'] as const)(
    'rejects %s failures without creating a download',
    async (kind) => {
      const pending = downloadSalesReport(query, options, new AbortController().signal)
      const rejected = expect(pending).rejects.toThrow(SALES_REPORT_ERROR)
      await flushPromises()
      const worker = TestWorker.instances[0]!
      if (kind === 'worker') worker.onerror!(new ErrorEvent('error'))
      else if (kind === 'message') worker.onmessageerror!()
      else
        worker.onmessage!(
          new MessageEvent('message', {
            data:
              kind === 'rejected'
                ? { ok: false }
                : { ok: true, buffer: new ArrayBuffer(kind === 'short' ? 2 : 8) },
          }),
        )
      await rejected
      expect(worker.terminate).toHaveBeenCalled()
      expect(click).not.toHaveBeenCalled()
    },
  )
  it('ends stalled generation at the deadline and allows the next attempt', async () => {
    const pending = downloadSalesReport(query, options, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow(SALES_REPORT_ERROR)
    await flushPromises()
    vi.advanceTimersByTime(60000)
    await rejected
    expect(TestWorker.instances[0]!.terminate).toHaveBeenCalled()
    const retry = downloadSalesReport(query, options, new AbortController().signal)
    await flushPromises()
    TestWorker.instances[1]!.onmessage!(
      new MessageEvent('message', { data: { ok: true, buffer: pdf() } }),
    )
    expect(await retry).toBe('downloaded')
  })
  it('fails cleanly if preparing colors or serializing the request fails', async () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null)
    await expect(downloadSalesReport(query, options, new AbortController().signal)).rejects.toThrow(
      SALES_REPORT_ERROR,
    )
    TestWorker.postFailure = true
    const pending = downloadSalesReport(query, options, new AbortController().signal)
    const rejected = expect(pending).rejects.toThrow(SALES_REPORT_ERROR)
    await flushPromises()
    await rejected
    expect(TestWorker.instances[0]!.terminate).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
  })
})
