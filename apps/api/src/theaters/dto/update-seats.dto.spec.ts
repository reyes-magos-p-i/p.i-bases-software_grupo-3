import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSeatsDto } from './update-seats.dto';

describe('UpdateSeatsDto', () => {
  const seats = [{ rowNumber: 1, columnNumber: 2 }];

  function validateDto(payload: object) {
    return validate(plainToInstance(UpdateSeatsDto, payload));
  }

  it.each(['libre', 'indisponible', 'ocupado', 'reservado'])(
    'accepts state "%s" without a type',
    async state => {
      const errors = await validateDto({ seats, state });

      expect(errors).toHaveLength(0);
    },
  );

  it.each(['normal', 'vip', 'accesibilidad'])(
    'accepts type "%s" without a state',
    async type => {
      const errors = await validateDto({ seats, type });

      expect(errors).toHaveLength(0);
    },
  );

  it('accepts state and type together', async () => {
    const errors = await validateDto({
      seats,
      state: 'libre',
      type: 'vip',
    });

    expect(errors).toHaveLength(0);
  });

  it.each([
    { seats },
    { seats, state: 'available' },
    { seats, type: 'premium' },
    { seats, state: null, type: 'vip' },
    { seats, state: 'libre', type: null },
    { seats, state: 'invalid', type: 'vip' },
    { seats, state: 'libre', type: 'invalid' },
  ])('rejects missing changes or invalid values: %j', async payload => {
    const errors = await validateDto(payload);

    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([
    { state: 'libre' },
    { seats: [], state: 'libre' },
    { seats: 'invalid', state: 'libre' },
  ])('rejects missing, empty, or non-array seats: %j', async payload => {
    const errors = await validateDto(payload);

    expect(errors.some(error => error.property === 'seats')).toBe(true);
  });

  it('accepts 10,000 seats', async () => {
    const errors = await validateDto({
      seats: Array.from({ length: 10_000 }, () => ({
        rowNumber: 1,
        columnNumber: 1,
      })),
      state: 'libre',
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects more than 10,000 seats', async () => {
    const errors = await validateDto({
      seats: Array.from({ length: 10_001 }, () => ({
        rowNumber: 1,
        columnNumber: 1,
      })),
      state: 'libre',
    });

    expect(
      errors.find(error => error.property === 'seats')?.constraints,
    ).toHaveProperty('arrayMaxSize');
  });

  it.each(['rowNumber', 'columnNumber'])(
    'accepts the maximum safe integer for %s',
    async field => {
      const errors = await validateDto({
        seats: [{ ...seats[0], [field]: Number.MAX_SAFE_INTEGER }],
        state: 'libre',
      });

      expect(errors).toHaveLength(0);
    },
  );

  describe.each(['rowNumber', 'columnNumber'])('%s validation', field => {
    it.each([0, -1, 1.5, '1', null, undefined, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid coordinate %j',
      async value => {
        const errors = await validateDto({
          seats: [{ ...seats[0], [field]: value }],
          state: 'libre',
        });

        const seatErrors = errors.find(error => error.property === 'seats');

        expect(seatErrors?.children?.[0]?.children).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ property: field }),
          ]),
        );
      },
    );
  });
});
