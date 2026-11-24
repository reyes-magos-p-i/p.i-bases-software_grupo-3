import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { SalesReportPalette, SalesReportRequest } from '@/types/sales-report'
import type { SalesMetric } from '@/types/sales-statistics'
import {
  cartesianLayout,
  chartLabelIndexes,
  chartMaximum,
  chartRatio,
  donutSegments,
} from './chart-geometry'
import {
  SALES_CHARTS,
  SALES_METRICS,
  SALES_NOTES,
  salesChartPoints,
  salesDate,
  salesValue,
} from './sales-statistics-presentation'

type Point = { key: string; label: string; value: number }
const WIDTH = 499
const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

function reportValue(value: number, metric: SalesMetric): ContentText['text'] {
  const formatted = salesValue(value, metric)
  return metric === 'revenue' ? [{ text: '₡', font: 'NotoSans' }, formatted.slice(1)] : formatted
}

const svgValue = (value: string) =>
  xml(value).replaceAll('₡', '<tspan font-family="NotoSans">₡</tspan>')

function lineChart(points: Point[], metric: SalesMetric, palette: SalesReportPalette): Content {
  const layout = cartesianLayout(
    points.map((point) => point.value),
    { left: 80, width: 404, top: 30, bottom: 250 },
  )
  const compact = new Intl.NumberFormat('es-CR', { notation: 'compact', maximumFractionDigits: 1 })
  const ticks = layout.ticks
    .map(
      (tick) =>
        `<line x1="80" x2="484" y1="${layout.y(tick)}" y2="${layout.y(tick)}" stroke="${palette.ink}" stroke-opacity="0.15" stroke-dasharray="3 4"/><text x="70" y="${layout.y(tick) + 4}" text-anchor="end">${svgValue((metric === 'revenue' ? '₡' : '') + compact.format(tick))}</text>`,
    )
    .join('')
  const labels = chartLabelIndexes(points.length, WIDTH)
    .map(
      (index) =>
        `<text x="${layout.x(index)}" y="275" text-anchor="${index === points.length - 1 ? 'end' : 'middle'}">${xml(points[index]!.label)}</text>`,
    )
    .join('')
  const dots = points
    .map(
      (point, index) =>
        `<circle cx="${layout.x(index)}" cy="${layout.y(point.value)}" r="2.5" fill="${palette.paper}" stroke="${palette.secondary}" stroke-width="1.5"/>`,
    )
    .join('')
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="499" height="310" viewBox="0 0 499 310"><g font-family="Helvetica" font-size="10" fill="${palette.ink}">${ticks}<polyline points="${layout.coordinates}" fill="none" stroke="${palette.secondary}" stroke-width="2"/>${dots}${labels}<text x="280" y="302" text-anchor="middle">Fecha de compra</text></g></svg>`,
    width: WIDTH,
  }
}

function barChart(points: Point[], metric: SalesMetric, palette: SalesReportPalette): Content {
  const maximum = chartMaximum(points.map((point) => point.value))
  return {
    stack: points.map((point, index) => ({
      unbreakable: true,
      stack: [
        {
          columns: [
            { text: point.label, width: '*' },
            { text: reportValue(point.value, metric), width: 'auto', bold: true },
          ],
          columnGap: 16,
          margin: [0, 12, 0, 6],
        },
        {
          canvas: [
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: WIDTH,
              h: 8,
              r: 4,
              color: palette.ink,
              fillOpacity: 0.08,
            },
            {
              type: 'rect',
              x: 0,
              y: 0,
              w: chartRatio(point.value, maximum) * WIDTH,
              h: 8,
              r: 4,
              color: index % 2 ? palette.secondary : palette.accent,
            },
          ],
        },
      ],
    })),
  }
}

function donutChart(points: Point[], metric: SalesMetric, palette: SalesReportPalette): Content {
  const total = points.reduce((sum, point) => sum + point.value, 0)
  if (!total)
    return { text: 'No hay importes para representar en esta selección.', margin: [0, 20] }
  const circumference = 2 * Math.PI * 85
  const segments = donutSegments(points)
  const circles = segments
    .map(
      (segment, index) =>
        `<circle cx="120" cy="110" r="85" fill="none" stroke="${palette.chartColors[index % palette.chartColors.length]}" stroke-width="28" stroke-dasharray="${(segment.size / 100) * circumference} ${((100 - segment.size) / 100) * circumference}" stroke-dashoffset="${(-segment.offset / 100) * circumference}" transform="rotate(-90 120 110)"/>`,
    )
    .join('')
  const percent = new Intl.NumberFormat('es-CR', { style: 'percent', maximumFractionDigits: 1 })
  return {
    stack: [
      {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="220"><circle cx="120" cy="110" r="85" fill="none" stroke="${palette.ink}" stroke-width="30"/>${circles}<text x="120" y="110" font-family="Helvetica" font-size="${Math.min(18, 165 / salesValue(total, metric).length)}" fill="${palette.ink}" text-anchor="middle">${svgValue(salesValue(total, metric))}</text><text x="120" y="130" font-family="Helvetica" font-size="11" fill="${palette.ink}" text-anchor="middle">Total</text></svg>`,
        width: 250,
        alignment: 'center',
      },
      {
        table: {
          widths: [12, '*', 'auto', 'auto'],
          body: segments.map((segment, index) => [
            {
              canvas: [
                {
                  type: 'ellipse',
                  x: 4,
                  y: 6,
                  r1: 3,
                  r2: 3,
                  color: palette.chartColors[index % palette.chartColors.length],
                },
              ],
            },
            segment.label,
            { text: reportValue(segment.value, metric), alignment: 'right' },
            { text: percent.format(segment.size / 100), alignment: 'right' },
          ]),
        },
        layout: 'noBorders',
        margin: [0, 12, 0, 0],
      },
    ],
  }
}

function dataAppendix(request: SalesReportRequest): Content[] {
  const { statistics: data } = request
  return [
    { text: 'Anexo A · Datos utilizados', style: 'section', pageBreak: 'before' },
    {
      table: {
        widths: ['*', 'auto'],
        headerRows: 1,
        body: [
          [
            { text: 'Indicador', bold: true },
            { text: 'Total', bold: true },
          ],
          ...SALES_METRICS.map((metric) => [
            metric.label,
            { text: reportValue(data.summary[metric.value], metric.value) },
          ]),
          ['Promedio por compra', { text: reportValue(data.summary.averagePurchase, 'revenue') }],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 12, 0, 20],
    },
    ...SALES_CHARTS.map((chart): Content => {
      const groups = chart.key === 'series' ? data.series : data.rankings[chart.key]
      return {
        stack: [
          { text: chart.title, style: 'chartTitle', headlineLevel: 1 },
          {
            table: {
              headerRows: 1,
              dontBreakRows: true,
              keepWithHeaderRows: 1,
              widths: ['*', 'auto', 'auto', 'auto'],
              body: [
                ['Categoría', 'Ingresos', 'Boletos', 'Compras'].map((text) => ({
                  text,
                  bold: true,
                })),
                ...groups.map((group) => [
                  chart.key === 'series' ? salesDate(group.key) : group.label,
                  ...SALES_METRICS.map((metric) => ({
                    text: reportValue(group[metric.value], metric.value),
                    alignment: 'right' as const,
                  })),
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
            fontSize: 9,
          },
        ],
        margin: [0, 0, 0, 20],
      }
    }),
  ]
}

function notesAppendix(): Content[] {
  return [
    { text: 'Anexo B · Criterios y aclaraciones', style: 'section', pageBreak: 'before' },
    {
      ul: [
        ...SALES_NOTES.general,
        'El periodo incluye ambos días y se aplica a la fecha de compra, no a la fecha de la función.',
        'Se excluyen las facturas pendientes, fallidas y canceladas. Una función cancelada no equivale a una devolución: sus ventas se incluyen mientras la factura siga pagada.',
        'Los ingresos son el total facturado. Los boletos se cuentan por las cantidades de productos de tipo boleto; los productos adicionales no cuentan como boletos.',
        'Cada factura cuenta como una compra, independientemente del número de boletos. El promedio divide los ingresos entre las compras.',
        ...SALES_NOTES.categories,
        'Los géneros e idiomas pueden superponerse: sus sumas no representan un reparto exclusivo del total.',
        ...SALES_NOTES.provinces,
        ...SALES_NOTES.audience,
        'Los gráficos de barras muestran hasta diez categorías, ordenadas por la medida correspondiente. El anexo de datos conserva todos los grupos, incluso los que no aparecen en el gráfico.',
        'El reporte incluye las tres medidas y todas las vistas, sin aplicar los filtros de edad ni las selecciones visibles del tablero.',
        'Los periodos sin ventas dentro de la serie temporal se representan con cero. La agrupación puede ser diaria, semanal, mensual o anual según la duración del periodo.',
        'Estos datos representan ingresos por ventas; no calculan ganancias netas, costos ni devoluciones no ejecutadas.',
      ],
      margin: [0, 16, 0, 0],
      lineHeight: 1.3,
    },
  ]
}

function reportGraphic(
  type: 'line' | 'bar' | 'donut',
  points: Point[],
  metric: SalesMetric,
  palette: SalesReportPalette,
): Content {
  if (!points.length) return { text: 'No hay ventas para esta selección.', margin: [0, 20] }
  if (type === 'line') return lineChart(points, metric, palette)
  return type === 'bar' ? barChart(points, metric, palette) : donutChart(points, metric, palette)
}

export function salesReportDocument(request: SalesReportRequest): TDocumentDefinitions {
  const { statistics: data, palette, options } = request
  if (!data.summary.purchases || data.ageFilter)
    throw new RangeError('A complete paid sales cohort is required')
  const content: Content[] = []
  for (const metric of SALES_METRICS) {
    for (const chart of SALES_CHARTS) {
      const points = salesChartPoints(data, chart.key, metric.value)
      content.push({
        stack: [
          { text: metric.label, style: 'section' },
          { text: chart.title, style: 'chartTitle' },
          reportGraphic(chart.type, points, metric.value, palette),
        ],
        pageBreak: content.length ? 'before' : undefined,
      })
    }
  }
  if (options.dataAppendix) content.push(...dataAppendix(request))
  if (options.notesAppendix) content.push(...notesAppendix())
  const period = `${salesDate(data.period.dateFrom)} — ${salesDate(data.period.dateTo)}`
  const generated = new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  }).format(new Date(request.generatedAt))
  return {
    pageSize: 'A4',
    pageMargins: [48, 90, 48, 50],
    info: {
      title: `Cinetadel · Reporte de ventas · ${period}`,
      author: 'Cinetadel',
      subject: 'Estadísticas de ventas agregadas',
    },
    defaultStyle: { font: 'Helvetica', fontSize: 11, color: palette.ink },
    styles: {
      section: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
      chartTitle: { fontSize: 14, bold: true, margin: [0, 8, 0, 16] },
    },
    header: (current) => ({
      stack: [
        { text: 'Cinetadel · Reporte de ventas', bold: true, fontSize: 12 },
        { text: period, fontSize: 10, margin: [0, 6, 0, 0] },
        ...(current === 1
          ? [
              {
                text: `Reporte generado el ${generated}`,
                fontSize: 9,
                margin: [0, 6, 0, 0] as [number, number, number, number],
              },
            ]
          : []),
      ],
      margin: [48, 28, 48, 0],
      color: palette.ink,
    }),
    content,
  }
}
