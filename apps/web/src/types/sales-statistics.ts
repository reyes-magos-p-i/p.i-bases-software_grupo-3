export type SalesMetric = 'revenue' | 'tickets' | 'purchases'
export type SalesGrouping = 'day' | 'week' | 'month' | 'year'
export type SalesDimension =
  'movies' | 'genres' | 'languages' | 'provinces' | 'branches' | 'ages' | 'ageRanges' | 'genders'
export interface SalesGroup {
  key: string
  label: string
  revenue: number
  tickets: number
  purchases: number
}
export interface SalesStatisticsQuery {
  dateFrom: string
  dateTo: string
  minAge?: number
  maxAge?: number
}
export interface SalesStatistics {
  period: { dateFrom: string; dateTo: string; grouping: SalesGrouping }
  ageFilter: { min: number; max: number } | null
  summary: { revenue: number; tickets: number; purchases: number; averagePurchase: number }
  series: SalesGroup[]
  rankings: Record<SalesDimension, SalesGroup[]>
}
