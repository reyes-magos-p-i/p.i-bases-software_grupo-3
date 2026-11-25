import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SalesStatisticsQueryDto } from './sales-statistics-query.dto';

describe('SalesStatisticsQueryDto', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-24T02:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('accepts a complete inclusive period and zero as the initial age', async () => {
    const query = plainToInstance(SalesStatisticsQueryDto, {
      dateFrom: '2024-02-29',
      dateTo: '2026-11-21',
      minAge: '0',
      maxAge: '65',
    });
    expect(await validate(query)).toHaveLength(0);
    expect(query).toMatchObject({ minAge: 0, maxAge: 65 });
  });
  it('allows a period without demographic restrictions', async () => {
    expect(
      await validate(
        plainToInstance(SalesStatisticsQueryDto, {
          dateFrom: '2026-11-01',
          dateTo: '2026-11-21',
        }),
      ),
    ).toHaveLength(0);
  });
  it.each(['dateFrom', 'dateTo'] as const)(
    'rejects a future %s with a clear field message',
    async (field) => {
      const query = plainToInstance(SalesStatisticsQueryDto, {
        dateFrom: '2026-11-23',
        dateTo: '2026-11-23',
        [field]: '2026-11-24',
      });
      expect(await validate(query)).toEqual([
        expect.objectContaining({
          property: field,
          constraints: {
            dateOnly:
              field === 'dateFrom'
                ? 'Selecciona una fecha de inicio válida que no sea posterior a hoy.'
                : 'Selecciona una fecha de fin válida que no sea posterior a hoy.',
          },
        }),
      ]);
    },
  );
  it('accepts today according to Costa Rica and refreshes the limit at midnight', async () => {
    const query = plainToInstance(SalesStatisticsQueryDto, {
      dateFrom: '2026-11-23',
      dateTo: '2026-11-23',
    });
    expect(await validate(query)).toHaveLength(0);
    query.dateTo = '2026-11-24';
    expect((await validate(query)).map((error) => error.property)).toEqual([
      'dateTo',
    ]);
    jest.setSystemTime(new Date('2026-11-24T06:00:00Z'));
    expect(await validate(query)).toHaveLength(0);
  });
  it.each([
    { dateFrom: '' },
    { dateTo: '' },
    { dateFrom: '2026-02-29' },
    { dateFrom: '0000-01-01' },
    { dateTo: '21/11/2026' },
    { dateTo: ['2026-11-01'] },
    { minAge: '-1' },
    { maxAge: '2.5' },
    { minAge: 'abc' },
    { maxAge: '10000' },
    { minAge: true },
  ])('rejects invalid dates or ages: %j', async (invalid) => {
    const query = plainToInstance(SalesStatisticsQueryDto, {
      dateFrom: '2026-11-01',
      dateTo: '2026-11-21',
      ...invalid,
    });
    expect((await validate(query)).length).toBeGreaterThan(0);
  });
});
