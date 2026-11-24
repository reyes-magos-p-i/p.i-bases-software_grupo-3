import type {
  SalesDimension,
  SalesGroup,
  SalesMetric,
  SalesStatistics,
} from '@/types/sales-statistics'
import { displayText } from './display-text'

export const SALES_METRICS: { value: SalesMetric; label: string }[] = [
  { value: 'revenue', label: 'Ingresos' },
  { value: 'tickets', label: 'Boletos vendidos' },
  { value: 'purchases', label: 'Compras realizadas' },
]
export const SALES_RANKINGS = {
  movies: 'Películas más vendidas',
  genres: 'Géneros más vendidos',
  languages: 'Idiomas más vendidos',
  branches: 'Sucursales con más ventas',
}
export const SALES_AUDIENCES = {
  ages: 'Edades del comprador',
  ageRanges: 'Rangos de edad',
  genders: 'Género del comprador',
}
export const SALES_NOTES = {
  general: [
    'Se incluyen las compras pagadas de clientes e invitados.',
    'Los importes se muestran en colones costarricenses y las fechas usan la hora de Costa Rica.',
  ],
  provinces: [
    'Se usa la provincia registrada actualmente en el perfil del comprador.',
    'Los invitados y los datos faltantes se muestran como «Sin información».',
  ],
  categories: [
    'Una película puede tener varios géneros o idiomas. Sus ventas se incluyen en cada categoría correspondiente.',
  ],
  audience: [
    'Estos datos corresponden al comprador, no a todos los asistentes.',
    'La edad actual se calcula a partir de la fecha de nacimiento. El género usa los datos registrados actualmente.',
    'Los invitados y los datos faltantes se muestran como «Sin información».',
  ],
}
export type SalesChartKey = 'series' | SalesDimension
export const SALES_CHARTS: { key: SalesChartKey; title: string; type: 'line' | 'bar' | 'donut' }[] =
  [
    { key: 'series', title: 'Evolución de las ventas', type: 'line' },
    ...Object.entries(SALES_RANKINGS).map(([key, title]) => ({
      key: key as SalesChartKey,
      title,
      type: 'bar' as const,
    })),
    { key: 'provinces', title: 'Ventas por provincia', type: 'donut' },
    { key: 'ages', title: SALES_AUDIENCES.ages, type: 'bar' },
    { key: 'ageRanges', title: SALES_AUDIENCES.ageRanges, type: 'bar' },
    { key: 'genders', title: SALES_AUDIENCES.genders, type: 'donut' },
  ]

const currency = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 2,
})
const count = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 })
export const salesDate = (date: string) => date.split('-').reverse().join('/')
export const salesValue = (value: number, metric: SalesMetric) =>
  metric === 'revenue' ? currency.format(value) : count.format(value)

export function salesPoints(groups: readonly SalesGroup[], metric: SalesMetric) {
  return groups.map((group) => ({
    key: group.key,
    label: displayText(group.label),
    value: group[metric],
  }))
}

export function rankedSalesPoints(
  groups: readonly SalesGroup[],
  metric: SalesMetric,
  numeric = false,
) {
  return salesPoints(groups, metric)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es', { numeric }))
    .slice(0, 10)
}

export function salesChartPoints(data: SalesStatistics, key: SalesChartKey, metric: SalesMetric) {
  if (key === 'series')
    return salesPoints(data.series, metric).map((point) => ({
      ...point,
      label: salesDate(point.key),
    }))
  const groups = data.rankings[key]
  if (key === 'genders')
    return salesPoints(groups, metric).sort((a, b) => a.label.localeCompare(b.label, 'es'))
  if (key === 'provinces')
    return salesPoints(groups, metric).sort(
      (a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'),
    )
  return rankedSalesPoints(groups, metric, key === 'ages' || key === 'ageRanges')
}
