import { validate } from 'class-validator';

import { CreatePromotionDto } from './create-promotion.dto';

describe('CreatePromotionDto', () => {
  const validPayload = (): CreatePromotionDto => ({
    promotionType: 'percentage',
    promotionAmount: 25,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
    beginHour: '14:30',
    endHour: '18:00',
    projectionFormat: '2D',
    technology: 'STANDARD',
    promotionTitle: 'Afternoon discount',
    description: 'Discount on afternoon screenings.',
    weekdays: [2, 4],
  });

  async function errorsFor(payload: object) {
    const dto = Object.assign(new CreatePromotionDto(), payload);
    return validate(dto);
  }

  it('accepts a valid payload', async () => {
    await expect(errorsFor(validPayload())).resolves.toEqual([]);
  });

  it('accepts omitted optional fields', async () => {
    await expect(
      errorsFor({
        promotionType: 'fixed',
        promotionAmount: 4000,
        beginDate: '2026-11-17',
        endDate: '2026-12-31',
        promotionTitle: 'Fixed discount',
        description: 'Discount description.',
      }),
    ).resolves.toEqual([]);
  });

  it('accepts null optional fields', async () => {
    await expect(
      errorsFor({
        ...validPayload(),
        beginHour: null,
        endHour: null,
        projectionFormat: null,
        technology: null,
        conditions: null,
        posterPath: null,
        weekdays: null,
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    'promotionType',
    'promotionAmount',
    'beginDate',
    'endDate',
    'promotionTitle',
    'description',
  ])('rejects a missing required field: %s', async (field) => {
    const payload: Record<string, unknown> = { ...validPayload() };
    delete payload[field];

    const errors = await errorsFor(payload);

    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it.each([
    ['promotionType', 'other'],
    ['promotionAmount', 0],
    ['promotionAmount', -1],
    ['promotionAmount', 4000.01],
    ['promotionAmount', 10.123],
    ['promotionAmount', '25'],
    ['promotionAmount', NaN],
    ['promotionAmount', Infinity],
    ['beginDate', '17/11/2026'],
    ['endDate', '2026-1-01'],
    ['beginHour', '24:00'],
    ['beginHour', '9:00'],
    ['beginHour', '14:60'],
    ['endHour', '24:01'],
    ['projectionFormat', '4D'],
    ['technology', 'standard'],
    ['promotionTitle', ''],
    ['promotionTitle', '   '],
    ['description', ''],
    ['description', '   '],
    ['promotionTitle', 'a'.repeat(151)],
    ['description', 'a'.repeat(4001)],
    ['conditions', 'a'.repeat(4001)],
    ['posterPath', 'a'.repeat(501)],
    ['weekdays', [1, 1]],
    ['weekdays', [0]],
    ['weekdays', [8]],
    ['weekdays', [1.5]],
    ['weekdays', ['2']],
    ['weekdays', '2,4'],
  ])('rejects invalid %s: %p', async (field, value) => {
    const errors = await errorsFor({
      ...validPayload(),
      [field]: value,
    });

    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it('accepts supported boundary values', async () => {
    await expect(
      errorsFor({
        ...validPayload(),
        promotionAmount: 0.01,
        beginHour: '00:00',
        endHour: '24:00',
        promotionTitle: 'a'.repeat(150),
        description: 'a'.repeat(4000),
        conditions: 'a'.repeat(4000),
        posterPath: 'a'.repeat(500),
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      }),
    ).resolves.toEqual([]);
  });

  it('accepts an empty weekday array', async () => {
    await expect(
      errorsFor({
        ...validPayload(),
        weekdays: [],
      }),
    ).resolves.toEqual([]);
  });
});
