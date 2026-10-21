import { validate } from 'class-validator';
import { DateOnly, isDateOnly, todayInCostaRica } from './date-only.decorator';

class Profile {
  @DateOnly({ notFuture: true })
  birthday: unknown;
  @DateOnly({ notBefore: 'birthday' })
  hireDate: unknown;
}
class Registration {
  @DateOnly({ notFuture: true, minimumAge: 18 })
  birthday: unknown;
}
class DateInput {
  @DateOnly()
  date: unknown;
}

describe('DateOnly', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T02:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('uses the Costa Rica calendar day rather than UTC', () => {
    expect(todayInCostaRica()).toBe('2026-10-18');
  });
  it.each(['0001-01-01', '2000-02-29', '9999-12-31'])(
    'accepts a real date: %s',
    async (date) => {
      expect(isDateOnly(date)).toBe(true);
      expect(await validate(Object.assign(new DateInput(), { date }))).toEqual(
        [],
      );
    },
  );
  it.each([
    '0000-01-01',
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-1-01',
    '2026-01-01T00:00:00Z',
    '10000-01-01',
    '',
    null,
    20260101,
  ])('rejects an invalid calendar date: %p', async (date) => {
    expect(isDateOnly(date)).toBe(false);
    expect(
      (await validate(Object.assign(new DateInput(), { date })))[0].constraints,
    ).toHaveProperty('dateOnly');
  });
  it.each(['2026-10-18', '2030-01-01', '9999-12-31'])(
    'allows hiring today or in the future: %s',
    async (hireDate) => {
      expect(
        await validate(
          Object.assign(new Profile(), { birthday: '2000-02-29', hireDate }),
        ),
      ).toEqual([]);
    },
  );
  it('allows the same birth and hire date without imposing an age minimum', async () => {
    expect(
      await validate(
        Object.assign(new Profile(), {
          birthday: '2026-10-18',
          hireDate: '2026-10-18',
        }),
      ),
    ).toEqual([]);
  });
  it('rejects future birth dates and hiring before birth', async () => {
    const errors = await validate(
      Object.assign(new Profile(), {
        birthday: '2026-10-19',
        hireDate: '2026-10-18',
      }),
    );
    expect(errors.map((error) => error.property)).toEqual([
      'birthday',
      'hireDate',
    ]);
  });
  it('leaves invalid comparison fields to their own validation', async () => {
    const errors = await validate(
      Object.assign(new Profile(), {
        birthday: 'invalid',
        hireDate: '2026-10-18',
      }),
    );
    expect(errors.map((error) => error.property)).toEqual(['birthday']);
  });
  it.each([
    ['2008-10-18', true],
    ['2008-10-19', false],
    ['2009-01-01', false],
    ['2007-12-31', true],
  ])(
    'enforces the existing public registration age for %s',
    async (birthday, accepted) => {
      const errors = await validate(
        Object.assign(new Registration(), { birthday }),
      );
      expect(errors.length === 0).toBe(accepted);
    },
  );
});
