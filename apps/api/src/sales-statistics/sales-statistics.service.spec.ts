import { BadRequestException } from '@nestjs/common';
import { SalesStatisticsRepository } from './sales-statistics.repository';
import { SalesStatisticsService } from './sales-statistics.service';
import type { SalesStatisticsRow } from './sales-statistics.types';

describe('SalesStatisticsService', () => {
  const repository = { read: jest.fn() };
  const service = new SalesStatisticsService(
    repository as unknown as SalesStatisticsRepository,
  );
  const row = (
    DIMENSION: SalesStatisticsRow['DIMENSION'],
    KEY: string,
    revenue = 6000,
    tickets = 2,
    purchases = 1,
  ): SalesStatisticsRow => ({
    DIMENSION,
    KEY,
    LABEL: KEY,
    REVENUE: revenue,
    TICKETS: tickets,
    PURCHASES: purchases,
  });
  beforeEach(() => repository.read.mockReset().mockResolvedValue([]));

  it('combines paid totals, fills missing dates and computes the average per purchase', async () => {
    repository.read.mockResolvedValue([
      row('summary', 'summary', 10000, 3, 2),
      row('series', '2026-11-02', 10000, 3, 2),
      row('movies', 'Movie'),
    ]);
    const result = await service.get({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-03',
    });
    expect(result.summary).toEqual({
      revenue: 10000,
      tickets: 3,
      purchases: 2,
      averagePurchase: 5000,
    });
    expect(result.series).toEqual([
      {
        key: '2026-11-01',
        label: '2026-11-01',
        revenue: 0,
        tickets: 0,
        purchases: 0,
      },
      {
        key: '2026-11-02',
        label: '2026-11-02',
        revenue: 10000,
        tickets: 3,
        purchases: 2,
      },
      {
        key: '2026-11-03',
        label: '2026-11-03',
        revenue: 0,
        tickets: 0,
        purchases: 0,
      },
    ]);
    expect(result.rankings.movies).toHaveLength(1);
    expect(result.ageFilter).toBeNull();
  });
  it.each([
    ['2026-11-01', '2026-11-01', 'day', '2026-11-01', '2026-11-01', 1],
    ['2024-02-28', '2024-03-01', 'day', '2024-02-28', '2024-03-01', 3],
    ['2026-01-01', '2026-02-15', 'week', '2025-12-29', '2026-02-09', 7],
    ['2024-02-29', '2025-02-28', 'month', '2024-02-01', '2025-02-01', 13],
    ['2020-08-01', '2026-11-21', 'year', '2020-01-01', '2026-01-01', 7],
  ])(
    'uses consistent %s–%s buckets (%s)',
    async (dateFrom, dateTo, grouping, first, last, count) => {
      repository.read.mockResolvedValue([row('summary', 'summary')]);
      const result = await service.get({ dateFrom, dateTo });
      expect(repository.read).toHaveBeenCalledWith(
        { dateFrom, dateTo },
        grouping,
      );
      expect(result.period.grouping).toBe(grouping);
      expect(result.series).toHaveLength(count);
      expect(result.series[0].key).toBe(first);
      expect(result.series.at(-1)?.key).toBe(last);
      const keys = result.series.map((point) => point.key);
      expect(new Set(keys).size).toBe(count);
      expect(keys).toEqual([...keys].sort());
    },
  );
  it('keeps empty periods empty without creating sales or unrelated data', async () => {
    const result = await service.get({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-21',
    });
    expect(result.summary).toEqual({
      revenue: 0,
      tickets: 0,
      purchases: 0,
      averagePurchase: 0,
    });
    expect(result.series).toEqual([]);
    expect(result.rankings.provinces).toEqual([]);
    expect(
      result.rankings.ageRanges.every((range) => range.purchases === 0),
    ).toBe(true);
  });
  it('aggregates ages across inclusive boundaries and retains unknown buyers', async () => {
    repository.read.mockResolvedValue([
      row('summary', 'summary'),
      ...[
        'UNKNOWN',
        '65',
        '18',
        '17',
        '24',
        '25',
        '34',
        '35',
        '44',
        '45',
        '54',
        '55',
        '64',
      ].map((age) => row('ages', age)),
    ]);
    const result = await service.get({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-21',
    });
    expect(result.rankings.ages[0].key).toBe('17');
    expect(result.rankings.ages.at(-1)?.key).toBe('UNKNOWN');
    expect(result.rankings.ageRanges.map((range) => range.purchases)).toEqual([
      1, 2, 2, 2, 2, 2, 1, 1,
    ]);
    expect(result.rankings.ageRanges[1].revenue).toBe(12000);
  });
  it('labels a custom age range without changing any general statistic', async () => {
    repository.read.mockResolvedValue([
      row('summary', 'summary', 20000, 5, 3),
      row('ages', '30'),
      row('ages', '40'),
      row('provinces', '1', 20000, 5, 3),
    ]);
    const result = await service.get({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-21',
      minAge: 30,
      maxAge: 40,
    });
    expect(result.ageFilter).toEqual({ min: 30, max: 40 });
    expect(result.rankings.ageRanges).toEqual([
      {
        key: '30-40',
        label: '30–40 años',
        revenue: 12000,
        tickets: 4,
        purchases: 2,
      },
    ]);
    expect(result.summary.purchases).toBe(3);
    expect(result.rankings.provinces[0].purchases).toBe(3);
  });
  it.each([
    { dateFrom: '2026-11-21', dateTo: '2026-11-01' },
    { dateFrom: '2026-11-01', dateTo: '2026-11-21', minAge: 0 },
    { dateFrom: '2026-11-01', dateTo: '2026-11-21', maxAge: 25 },
    { dateFrom: '2026-11-01', dateTo: '2026-11-21', minAge: 40, maxAge: 30 },
  ])(
    'rejects an inconsistent range without reading sales: %j',
    async (query) => {
      await expect(service.get(query)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.read).not.toHaveBeenCalled();
    },
  );
  it('rejects a failed read instead of returning a successful empty dashboard', async () => {
    repository.read.mockRejectedValue(new Error('Read failed'));
    await expect(
      service.get({ dateFrom: '2026-11-01', dateTo: '2026-11-21' }),
    ).rejects.toThrow('Read failed');
  });
  it('keeps currency precision in age buckets and labels the open senior range clearly', async () => {
    repository.read.mockResolvedValue([
      row('summary', 'summary', 0.3, 2, 2),
      row('ages', '65', 0.1),
      row('ages', '70', 0.2),
    ]);
    const result = await service.get({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-21',
      minAge: 65,
      maxAge: 9999,
    });
    expect(result.rankings.ageRanges[0].revenue).toBe(0.3);
    expect(result.rankings.ageRanges[0].label).toBe('65 años o más');
  });
});
