import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { salesStatistics } from '../helpers/sales-statistics'
import type { SalesReportRequest } from '@/types/sales-report'

const mocks = vi.hoisted(() => ({
  addContainer: vi.fn(),
  addVirtual: vi.fn(),
  addFonts: vi.fn(),
  createPdf: vi.fn(),
  getBuffer: vi.fn(),
  document: vi.fn(),
}))
vi.mock('pdfmake/build/pdfmake', () => ({
  default: {
    addFontContainer: mocks.addContainer,
    addVirtualFileSystem: mocks.addVirtual,
    addFonts: mocks.addFonts,
    createPdf: mocks.createPdf,
  },
}))
vi.mock('pdfmake/build/standard-fonts/Helvetica', () => ({
  default: { fonts: { Helvetica: { normal: 'Helvetica' } } },
}))
vi.mock('@/utils/sales-report-document', () => ({ salesReportDocument: mocks.document }))
let scope: {
  onmessage: ((event: MessageEvent<SalesReportRequest>) => Promise<void>) | null
  postMessage: ReturnType<typeof vi.fn>
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  scope = { onmessage: null, postMessage: vi.fn() }
  vi.stubGlobal('self', scope)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    }),
  )
  mocks.document.mockReturnValue({ content: ['Report'] })
  mocks.createPdf.mockReturnValue({ getBuffer: mocks.getBuffer })
  mocks.getBuffer.mockResolvedValue(new Uint8Array([37, 80, 68, 70, 45]))
})
afterEach(() => vi.unstubAllGlobals())
describe('sales report worker', () => {
  it('registers local fonts, builds the document and transfers only the PDF bytes', async () => {
    await import('@/workers/sales-report.worker')
    const input = { statistics: salesStatistics() } as SalesReportRequest
    await scope.onmessage!(new MessageEvent('message', { data: input }))
    expect(mocks.addContainer).toHaveBeenCalledWith({
      fonts: { Helvetica: { normal: 'Helvetica' } },
    })
    expect(mocks.addFonts).toHaveBeenCalledOnce()
    expect(mocks.addVirtual).toHaveBeenCalledWith({ 'NotoSans-Regular.ttf': 'AQID' })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('NotoSans-Regular.ttf'))
    expect(mocks.document).toHaveBeenCalledWith(input)
    expect(mocks.createPdf).toHaveBeenCalledWith({ content: ['Report'] })
    const [message, transfer] = scope.postMessage.mock.calls[0]!
    expect(message.ok).toBe(true)
    expect(Array.from(new Uint8Array(message.buffer))).toEqual([37, 80, 68, 70, 45])
    expect(transfer).toEqual([message.buffer])
    await scope.onmessage!(new MessageEvent('message', { data: input }))
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each(['http', 'network'] as const)(
    'fails safely when the local font has an %s error',
    async (kind) => {
      if (kind === 'http') vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
      else vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'))
      await import('@/workers/sales-report.worker')
      await scope.onmessage!(new MessageEvent('message', { data: {} as SalesReportRequest }))
      expect(scope.postMessage).toHaveBeenCalledWith({ ok: false })
      expect(mocks.createPdf).not.toHaveBeenCalled()
    },
  )
  it.each(['document', 'pdf'] as const)(
    'reports %s failures without exposing internal details',
    async (stage) => {
      await import('@/workers/sales-report.worker')
      if (stage === 'document')
        mocks.document.mockImplementationOnce(() => {
          throw new Error('Internal details')
        })
      else mocks.getBuffer.mockRejectedValueOnce(new Error('Internal details'))
      await scope.onmessage!(
        new MessageEvent('message', {
          data: { statistics: salesStatistics() } as SalesReportRequest,
        }),
      )
      expect(scope.postMessage).toHaveBeenCalledWith({ ok: false })
      expect(scope.postMessage).toHaveBeenCalledTimes(1)
    },
  )
})
