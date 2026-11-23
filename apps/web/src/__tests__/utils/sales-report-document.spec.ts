import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import pdfMake from 'pdfmake/build/pdfmake'
import helvetica from 'pdfmake/build/standard-fonts/Helvetica'
import { salesReportDocument } from '@/utils/sales-report-document'
import { salesGroup, salesStatistics } from '../helpers/sales-statistics'
import type { SalesReportRequest } from '@/types/sales-report'

function request(): SalesReportRequest {
  return {
    statistics: salesStatistics(),
    options: { dataAppendix: true, notesAppendix: true },
    generatedAt: '2026-11-23T12:00:00Z',
    palette: {
      ink: '#020617',
      paper: '#f8f9fa',
      accent: '#ffd700',
      secondary: '#8a2be2',
      chartColors: ['#ffd700', '#8a2be2', '#f8f9fa', '#0f172a'],
    },
  }
}
describe('sales report document', () => {
  it('builds all 27 charts and includes the selected period and full aggregate appendices', () => {
    const input = request()
    input.statistics.rankings.movies = Array.from({ length: 12 }, (_, index) =>
      salesGroup(`Movie ${index}`, (index + 1) * 1000),
    )
    const document = salesReportDocument(input)
    const content = document.content as { stack?: unknown[]; pageBreak?: string }[]
    expect(content.slice(0, 27).every((section) => section.stack?.length === 3)).toBe(true)
    expect(content.slice(1, 27).every((section) => section.pageBreak === 'before')).toBe(true)
    const charts = JSON.stringify(content.slice(0, 27))
    expect(charts).toContain('Evolución de las ventas')
    expect(charts).toContain('Ingresos')
    expect(charts).toContain('Boletos vendidos')
    expect(charts).toContain('Compras realizadas')
    expect(charts).toContain('Movie 11')
    expect(JSON.stringify(content.slice(0, 9))).not.toContain('Movie 0"')
    expect(JSON.stringify(content.slice(27))).toContain('Movie 0')
    expect(JSON.stringify(document)).toContain('Anexo B')
    expect(document.info?.title).toContain('01/11/2026 — 21/11/2026')
    expect(document.defaultStyle?.font).toBe('Helvetica')
    const timeline = content[0]!.stack![2] as { svg: string }
    expect(timeline.svg).toContain('<tspan font-family="NotoSans">₡</tspan>')
    expect(charts).toContain('"text":"₡","font":"NotoSans"')
    expect(JSON.stringify(document)).not.toContain('clientEmail')
  })
  it('can omit both appendices without omitting any chart', () => {
    const input = request()
    input.options = { dataAppendix: false, notesAppendix: false }
    expect(salesReportDocument(input).content).toHaveLength(27)
  })
  it('shows the generation date only on the first page and omits the repeated footer', () => {
    const input = request()
    input.generatedAt = '2026-11-24T02:00:00Z'
    const document = salesReportDocument(input)
    if (typeof document.header !== 'function')
      throw new TypeError('Expected a dynamic report header')
    const pageSize = { width: 595.28, height: 841.89, orientation: 'portrait' as const }
    expect(JSON.stringify(document.header(1, 31, pageSize))).toContain(
      'Reporte generado el 23/11/2026',
    )
    expect(JSON.stringify(document.header(2, 31, pageSize))).not.toContain('Reporte generado')
    expect(document.footer).toBeUndefined()
  })
  it('handles missing category data and zero income while preserving paid purchases', () => {
    const input = request()
    input.statistics.rankings.movies = []
    input.statistics.rankings.provinces = [salesGroup('Zero', 0)]
    input.statistics.summary.revenue = 0
    const document = JSON.stringify(salesReportDocument(input))
    expect(document).toContain('No hay ventas para esta selección.')
    expect(document).toContain('No hay importes para representar')
    expect(document).not.toContain('NaN')
    expect(document).not.toContain('Infinity')
  })
  it('rejects empty or age-restricted cohorts instead of presenting an incomplete report', () => {
    const input = request()
    input.statistics.summary.purchases = 0
    expect(() => salesReportDocument(input)).toThrow(RangeError)
    input.statistics.summary.purchases = 2
    input.statistics.ageFilter = { min: 18, max: 24 }
    expect(() => salesReportDocument(input)).toThrow(RangeError)
  })
  it('produces a real multipage PDF using the embedded fonts and vector charts', async () => {
    pdfMake.addFontContainer(helvetica)
    pdfMake.addVirtualFileSystem({
      'NotoSans-Regular.ttf': readFileSync('src/assets/fonts/NotoSans-Regular.ttf').toString(
        'base64',
      ),
    })
    pdfMake.addFonts({
      NotoSans: {
        normal: 'NotoSans-Regular.ttf',
        bold: 'NotoSans-Regular.ttf',
        italics: 'NotoSans-Regular.ttf',
        bolditalics: 'NotoSans-Regular.ttf',
      },
    })
    const bytes = await pdfMake.createPdf(salesReportDocument(request())).getBuffer()
    expect(bytes.toString('ascii', 0, 5)).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(10000)
    expect(bytes.toString('latin1')).toContain('/BaseFont /Helvetica')
    expect(bytes.toString('latin1')).toContain('NotoSans-Regular')
    expect(bytes.toString('latin1').match(/\/Type \/Page\b/gu)?.length).toBeGreaterThanOrEqual(29)
  })
})
