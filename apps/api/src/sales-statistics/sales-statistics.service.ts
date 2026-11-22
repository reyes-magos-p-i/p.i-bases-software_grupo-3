import { BadRequestException, Injectable } from '@nestjs/common';
import { SalesStatisticsRepository } from './sales-statistics.repository';
import { SalesStatisticsQueryDto } from './dto/sales-statistics-query.dto';
import {
  SALES_DIMENSIONS,
  type SalesGroup,
  type SalesGrouping,
  type SalesStatistics,
  type SalesValues,
} from './sales-statistics.types';

const DAY = 86400000;
const zero = (): SalesValues => ({ revenue: 0, tickets: 0, purchases: 0 });
const date = (value: string) => new Date(value + 'T00:00:00Z');
const key = (value: Date) => value.toISOString().slice(0, 10);
const ranges = [
  { min: 0, max: 17, label: 'Menores de 18' },
  { min: 18, max: 24, label: '18–24 años' },
  { min: 25, max: 34, label: '25–34 años' },
  { min: 35, max: 44, label: '35–44 años' },
  { min: 45, max: 54, label: '45–54 años' },
  { min: 55, max: 64, label: '55–64 años' },
  { min: 65, max: 9999, label: '65 años o más' },
];

function groupingFor(from: string, to: string): SalesGrouping {
  const days = (date(to).getTime() - date(from).getTime()) / DAY + 1;
  if (days <= 31) return 'day';
  if (days <= 180) return 'week';
  return days <= 1096 ? 'month' : 'year';
}
function bucket(value: Date, grouping: SalesGrouping) {
  if (grouping === 'week')
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  if (grouping === 'month' || grouping === 'year') value.setUTCDate(1);
  if (grouping === 'year') value.setUTCMonth(0);
  return value;
}
function nextBucket(value: Date, grouping: SalesGrouping) {
  if (grouping === 'day' || grouping === 'week')
    value.setUTCDate(value.getUTCDate() + (grouping === 'day' ? 1 : 7));
  else value.setUTCMonth(value.getUTCMonth() + (grouping === 'month' ? 1 : 12));
}
function seriesFor(
  points: SalesGroup[],
  query: SalesStatisticsQueryDto,
  grouping: SalesGrouping,
): SalesGroup[] {
  const found = new Map(points.map((point) => [point.key, point]));
  const result: SalesGroup[] = [];
  const last = date(query.dateTo);
  for (
    const current = bucket(date(query.dateFrom), grouping);
    current <= last;
    nextBucket(current, grouping)
  ) {
    const id = key(current);
    result.push(found.get(id) ?? { key: id, label: id, ...zero() });
  }
  return result;
}
function ageRanges(
  ages: SalesGroup[],
  query: SalesStatisticsQueryDto,
): SalesGroup[] {
  const selected =
    query.minAge === undefined
      ? ranges
      : [
          {
            min: query.minAge,
            max: query.maxAge!,
            label: `${query.minAge}–${query.maxAge} años`,
          },
        ];
  const result = selected.map((range) => {
    const matching = ages.filter(
      (age) =>
        age.key !== 'UNKNOWN' &&
        Number(age.key) >= range.min &&
        Number(age.key) <= range.max,
    );
    return matching.reduce<SalesGroup>(
      (total, age) => ({
        ...total,
        revenue: Math.round((total.revenue + age.revenue) * 100) / 100,
        tickets: total.tickets + age.tickets,
        purchases: total.purchases + age.purchases,
      }),
      {
        key: `${range.min}-${range.max}`,
        label:
          range.min === 65 && range.max === 9999
            ? '65 años o más'
            : range.label,
        ...zero(),
      },
    );
  });
  const unknown = ages.find((age) => age.key === 'UNKNOWN');
  if (unknown) result.push(unknown);
  return result;
}

@Injectable()
export class SalesStatisticsService {
  constructor(private readonly repository: SalesStatisticsRepository) {}

  async get(query: SalesStatisticsQueryDto): Promise<SalesStatistics> {
    if (query.dateFrom > query.dateTo)
      throw new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin.',
      );
    if ((query.minAge === undefined) !== (query.maxAge === undefined))
      throw new BadRequestException(
        'Completa la edad inicial y la edad final.',
      );
    if (query.minAge !== undefined && query.minAge > query.maxAge!)
      throw new BadRequestException(
        'La edad inicial no puede ser mayor que la edad final.',
      );
    const grouping = groupingFor(query.dateFrom, query.dateTo);
    const rows = await this.repository.read(query, grouping);
    const groups = (dimension: string): SalesGroup[] =>
      rows
        .filter((row) => row.DIMENSION === dimension)
        .map((row) => ({
          key: row.KEY,
          label: row.LABEL,
          revenue: row.REVENUE,
          tickets: row.TICKETS,
          purchases: row.PURCHASES,
        }));
    const summary = groups('summary')[0] ?? zero();
    const rankings = Object.fromEntries(
      SALES_DIMENSIONS.map((dimension) => [dimension, groups(dimension)]),
    ) as SalesStatistics['rankings'];
    rankings.ages.sort((a, b) => {
      if (a.key === 'UNKNOWN') return 1;
      if (b.key === 'UNKNOWN') return -1;
      return Number(a.key) - Number(b.key);
    });
    rankings.ageRanges = ageRanges(rankings.ages, query);
    return {
      period: { dateFrom: query.dateFrom, dateTo: query.dateTo, grouping },
      ageFilter:
        query.minAge === undefined
          ? null
          : { min: query.minAge, max: query.maxAge! },
      summary: {
        revenue: summary.revenue,
        tickets: summary.tickets,
        purchases: summary.purchases,
        averagePurchase: summary.purchases
          ? Math.round((summary.revenue / summary.purchases) * 100) / 100
          : 0,
      },
      series: summary.purchases
        ? seriesFor(groups('series'), query, grouping)
        : [],
      rankings,
    };
  }
}
