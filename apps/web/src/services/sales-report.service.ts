import { getSalesStatistics } from './sales-statistics.service'
import { statisticsPeriodError } from '@/utils/statistics-period'
import type { SalesStatisticsQuery } from '@/types/sales-statistics'
import type {
  SalesReportOptions,
  SalesReportPalette,
  SalesReportRequest,
  SalesReportResponse,
} from '@/types/sales-report'

export const SALES_REPORT_ERROR = 'No se pudo generar el reporte, intenta de nuevo'
const aborted = () => new DOMException('La generación fue cancelada.', 'AbortError')

function reportPalette(): SalesReportPalette {
  const styles = getComputedStyle(document.documentElement)
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error(SALES_REPORT_ERROR)
  const color = (name: string) => {
    const value = styles.getPropertyValue(name).trim()
    if (!value) throw new Error(SALES_REPORT_ERROR)
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    return `#${[r!, g!, b!].map((component) => component.toString(16).padStart(2, '0')).join('')}`
  }
  return {
    ink: color('--page-background'),
    paper: color('--content-background'),
    accent: color('--accent-color'),
    secondary: color('--primary-color'),
    chartColors: Array.from({ length: 8 }, (_, index) => color(`--chart-color-${index + 1}`)),
  }
}

function buildPdf(request: SalesReportRequest, signal: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/sales-report.worker.ts', import.meta.url), {
      type: 'module',
    })
    const timeout = setTimeout(() => fail(new Error(SALES_REPORT_ERROR)), 60000)
    function cleanup() {
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
      worker.terminate()
    }
    function fail(error: Error) {
      cleanup()
      reject(error)
    }
    function cancel() {
      fail(aborted())
    }
    signal.addEventListener('abort', cancel, { once: true })
    worker.onerror = (event) => {
      event.preventDefault()
      fail(new Error(SALES_REPORT_ERROR))
    }
    worker.onmessageerror = () => fail(new Error(SALES_REPORT_ERROR))
    worker.onmessage = (event: MessageEvent<SalesReportResponse>) => {
      const result = event.data
      if (!result?.ok || !(result.buffer instanceof ArrayBuffer) || result.buffer.byteLength < 5) {
        fail(new Error(SALES_REPORT_ERROR))
        return
      }
      const signature = Array.from(new Uint8Array(result.buffer, 0, 5))
        .map((byte) => String.fromCharCode(byte))
        .join('')
      if (signature !== '%PDF-') {
        fail(new Error(SALES_REPORT_ERROR))
        return
      }
      cleanup()
      resolve(result.buffer)
    }
    if (signal.aborted) {
      cancel()
      return
    }
    try {
      worker.postMessage(request)
    } catch {
      fail(new Error(SALES_REPORT_ERROR))
    }
  })
}

export async function downloadSalesReport(
  query: Pick<SalesStatisticsQuery, 'dateFrom' | 'dateTo'>,
  options: SalesReportOptions,
  signal: AbortSignal,
): Promise<'downloaded' | 'empty'> {
  if (signal.aborted) throw aborted()
  const error = statisticsPeriodError(query.dateFrom, query.dateTo)
  if (error) throw new RangeError(error)
  const period = { dateFrom: query.dateFrom, dateTo: query.dateTo }
  const statistics = await getSalesStatistics(period, signal)
  if (signal.aborted) throw aborted()
  if (!statistics.summary.purchases) return 'empty'
  const buffer = await buildPdf(
    { statistics, options, palette: reportPalette(), generatedAt: new Date().toISOString() },
    signal,
  )
  if (signal.aborted) throw aborted()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = `Cinetadel-ventas-${period.dateFrom}-${period.dateTo}.pdf`
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    // Keep the blob alive until the browser has accepted the download, including on Safari.
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  return 'downloaded'
}
