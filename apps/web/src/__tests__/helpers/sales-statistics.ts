import type { SalesGroup, SalesStatistics } from '@/types/sales-statistics'

export function salesGroup(key: string, revenue = 6000, tickets = 2, purchases = 1): SalesGroup {
  return { key, label: key, revenue, tickets, purchases }
}
export function salesStatistics(): SalesStatistics {
  return {
    period: { dateFrom: '2026-11-01', dateTo: '2026-11-21', grouping: 'day' },
    ageFilter: null,
    summary: { revenue: 12000, tickets: 4, purchases: 2, averagePurchase: 6000 },
    series: [salesGroup('2026-11-01'), salesGroup('2026-11-02')],
    rankings: {
      movies: [salesGroup('Película A'), salesGroup('Película B')],
      genres: [salesGroup('acción', 12000, 4, 2)],
      languages: [salesGroup('español', 12000, 4, 2)],
      branches: [salesGroup('Sucursal Centro', 12000, 4, 2)],
      provinces: [salesGroup('San José'), salesGroup('Sin información')],
      ages: [salesGroup('25'), { ...salesGroup('UNKNOWN'), label: 'Sin información' }],
      ageRanges: [salesGroup('25–34 años'), { ...salesGroup('UNKNOWN'), label: 'Sin información' }],
      genders: [salesGroup('Mujer'), { ...salesGroup('UNKNOWN'), label: 'Sin información' }],
    },
  }
}
