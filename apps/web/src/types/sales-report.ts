import type { SalesStatistics } from './sales-statistics'

export interface SalesReportOptions {
  dataAppendix: boolean
  notesAppendix: boolean
}
export interface SalesReportPalette {
  ink: string
  paper: string
  accent: string
  secondary: string
  chartColors: string[]
}
export interface SalesReportRequest {
  statistics: SalesStatistics
  options: SalesReportOptions
  palette: SalesReportPalette
  generatedAt: string
}
export type SalesReportResponse = { ok: true; buffer: ArrayBuffer } | { ok: false }
