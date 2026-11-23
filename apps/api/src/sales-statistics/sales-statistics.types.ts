export type SalesGrouping = 'day' | 'week' | 'month' | 'year';

export interface SalesValues {
  revenue: number;
  tickets: number;
  purchases: number;
}

export interface SalesGroup extends SalesValues {
  key: string;
  label: string;
}

export const SALES_DIMENSIONS = [
  'movies',
  'genres',
  'languages',
  'provinces',
  'branches',
  'ages',
  'genders',
] as const;
export type SalesDimension = (typeof SALES_DIMENSIONS)[number];

export interface SalesStatistics {
  period: { dateFrom: string; dateTo: string; grouping: SalesGrouping };
  ageFilter: { min: number; max: number } | null;
  summary: SalesValues & { averagePurchase: number };
  series: SalesGroup[];
  rankings: Record<SalesDimension | 'ageRanges', SalesGroup[]>;
}

export interface SalesStatisticsRow {
  DIMENSION: 'summary' | 'series' | SalesDimension;
  KEY: string;
  LABEL: string;
  REVENUE: number;
  TICKETS: number;
  PURCHASES: number;
}
