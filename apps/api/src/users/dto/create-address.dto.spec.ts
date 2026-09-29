import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAddressDto } from './create-address.dto';

describe('CreateAddressDto', () => {
  const validatePayload = (payload: Record<string, unknown>) =>
    validate(plainToInstance(CreateAddressDto, payload));

  it('accepts an address with only a district', async () => {
    await expect(validatePayload({ districtId: 1 })).resolves.toEqual([]);
  });

  it('accepts address details without changing the supplied text', async () => {
    const address = plainToInstance(CreateAddressDto, {
      districtId: 1,
      details: '  100 metros al norte, casa con portón azul.  ',
    });

    await expect(validate(address)).resolves.toEqual([]);
    expect(address.details).toBe(
      '  100 metros al norte, casa con portón azul.  ',
    );
  });

  it.each([undefined, null])(
    'requires a district when given %p',
    async (districtId) => {
      const errors = await validatePayload({ districtId });

      expect(errors).toEqual([
        expect.objectContaining({
          property: 'districtId',
          constraints: expect.objectContaining({
            isDefined: 'El identificador del distrito es obligatorio.',
          }),
        }),
      ]);
    },
  );

  it.each([
    '1',
    '',
    true,
    [],
    {},
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MIN_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    'rejects a non-numeric, non-integer or unsafe district ID %p',
    async (districtId) => {
      const address = plainToInstance(CreateAddressDto, { districtId });
      const errors = await validate(address);

      expect(address.districtId).toEqual(districtId);
      expect(errors.map((error) => error.property)).toEqual(['districtId']);
    },
  );

  it.each([Number.MIN_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER])(
    'accepts a safe integer district ID %p without checking database existence',
    async (districtId) => {
      await expect(validatePayload({ districtId })).resolves.toEqual([]);
    },
  );

  it.each([undefined, null, '', '   '])(
    'allows optional details %p',
    async (details) => {
      await expect(
        validatePayload({ districtId: 1, details }),
      ).resolves.toEqual([]);
    },
  );

  it.each([123, false, [], {}])(
    'rejects non-string details %p',
    async (details) => {
      const errors = await validatePayload({ districtId: 1, details });

      expect(errors.map((error) => error.property)).toEqual(['details']);
    },
  );

  it.each([
    ['ASCII', 'a'.repeat(255), 'a'.repeat(256)],
    ['accented characters', 'é'.repeat(127) + 'a', 'é'.repeat(128)],
    ['emoji', '🏠'.repeat(63) + 'abc', '🏠'.repeat(64)],
  ])(
    'enforces the 255-byte UTF-8 boundary for %s',
    async (_label, accepted, rejected) => {
      await expect(
        validatePayload({ districtId: 1, details: accepted }),
      ).resolves.toEqual([]);
      const errors = await validatePayload({
        districtId: 1,
        details: rejected,
      });

      expect(errors).toEqual([
        expect.objectContaining({
          property: 'details',
          constraints: expect.objectContaining({
            maxUtf8Bytes: expect.any(String),
          }),
        }),
      ]);
    },
  );

  it.each(['\uD800', '\uDC00'])(
    'rejects malformed Unicode in details %p',
    async (details) => {
      const errors = await validatePayload({ districtId: 1, details });

      expect(errors.map((error) => error.property)).toEqual(['details']);
    },
  );
});
