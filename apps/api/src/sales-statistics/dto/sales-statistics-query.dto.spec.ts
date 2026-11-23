import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SalesStatisticsQueryDto } from './sales-statistics-query.dto';

describe('SalesStatisticsQueryDto', () => {
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
