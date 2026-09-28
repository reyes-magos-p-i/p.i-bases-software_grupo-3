import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

describe('CreateClientDto', () => {
  const validPayload = {
    role: 'CLIENT',
    email: 'cliente@example.com',
    firstName: 'José',
  };

  const validatePayload = (payload: Record<string, unknown>) =>
    validate(plainToInstance(CreateClientDto, payload));

  it.each([
    {},
    [],
    [{ districtId: 7 }],
    7,
    '7',
    false,
    { districtId: undefined },
    { districtId: null },
    { districtId: '7' },
    { districtId: 1.5 },
    { districtId: Number.MAX_SAFE_INTEGER + 1 },
    { districtId: 7, details: 123 },
    { districtId: 7, details: 'é'.repeat(128) },
    { districtId: 7, details: '\uD800' },
  ])('rejects an invalid nested address %p', async (address) => {
    const errors = await validatePayload({ ...validPayload, address });
    expect(errors.map((error) => error.property)).toEqual(['address']);
  });

  it.each([undefined, null, '', 'é'.repeat(127) + 'a'])(
    'accepts a nested address with optional details %p',
    async (details) => {
      await expect(
        validatePayload({
          ...validPayload,
          address: { districtId: 7, details },
        }),
      ).resolves.toEqual([]);
    },
  );

  it('accepts a client with only the required fields', async () => {
    await expect(validatePayload(validPayload)).resolves.toEqual([]);
  });

  it('accepts a client with all profile fields provided', async () => {
    await expect(
      validatePayload({
        ...validPayload,
        secondName: 'Carlos',
        firstSurname: 'Núñez',
        secondSurname: 'Solano',
        birthday: '2000-02-29',
        phoneNumber: '+506 8888-8888',
        address: { districtId: 1 },
      }),
    ).resolves.toEqual([]);
  });

  it.each([
    'secondName',
    'firstSurname',
    'secondSurname',
    'birthday',
    'phoneNumber',
    'address',
  ])('allows an undefined or null %s', async (field) => {
    for (const value of [undefined, null]) {
      await expect(
        validatePayload({ ...validPayload, [field]: value }),
      ).resolves.toEqual([]);
    }
  });

  it.each([
    'ADMINISTRATOR',
    'ADMIN',
    'EMPLOYEE',
    'SUPERADMIN',
    'client',
    1,
    undefined,
    null,
  ])('rejects an unsupported or missing role %p', async (role) => {
    const errors = await validatePayload({ ...validPayload, role });

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'role',
        constraints: expect.objectContaining({
          isIn: 'El rol debe ser cliente.',
        }),
      }),
    ]);
  });

  it.each(['firstSurname', 'secondSurname', 'phoneNumber'])(
    'rejects non-string values for %s',
    async (field) => {
      for (const value of [123, false, [], {}]) {
        const errors = await validatePayload({
          ...validPayload,
          [field]: value,
        });

        expect(errors.map((error) => error.property)).toEqual([field]);
      }
    },
  );

  it.each(['firstSurname', 'secondSurname', 'phoneNumber'])(
    'allows an empty string for the optional %s',
    async (field) => {
      await expect(
        validatePayload({ ...validPayload, [field]: '' }),
      ).resolves.toEqual([]);
    },
  );

  it.each([
    '',
    '2023-02-29',
    '1900-02-29',
    '2024-04-31',
    '2024-13-01',
    '29/02/2000',
    '2000-2-29',
    '2000-02-29T00:00:00Z',
    '2000-02-29\n',
    20000229,
    new Date('2000-02-29T00:00:00Z'),
  ])('rejects an invalid birthday %p', async (birthday) => {
    const errors = await validatePayload({ ...validPayload, birthday });

    expect(errors.map((error) => error.property)).toEqual(['birthday']);
  });

  it.each([
    1.5,
    '1',
    false,
    NaN,
    Infinity,
    Number.MIN_SAFE_INTEGER - 1,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    'rejects a non-integer, non-numeric or unsafe district ID %p',
    async (districtId) => {
      const errors = await validatePayload({
        ...validPayload,
        address: { districtId },
      });

      expect(errors.map((error) => error.property)).toEqual(['address']);
    },
  );

  it.each([Number.MIN_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER])(
    'accepts the safe integer district ID %p',
    async (districtId) => {
      await expect(
        validatePayload({ ...validPayload, address: { districtId } }),
      ).resolves.toEqual([]);
    },
  );

  it('normalizes client email before applying inherited validation', async () => {
    const client = plainToInstance(CreateClientDto, {
      ...validPayload,
      email: 'Persona@Example.COM',
    });
    await expect(validate(client)).resolves.toEqual([]);
    expect(client.email).toBe('persona@example.com');
  });

  it.each([123, false, [], {}, null, undefined])(
    'rejects a non-string email without coercion: %p',
    async (email) => {
      const client = plainToInstance(CreateClientDto, {
        ...validPayload,
        email,
      });
      expect(client.email).toEqual(email);
      const errors = await validate(client);
      expect(errors.map((error) => error.property)).toEqual(['email']);
    },
  );

  it.each([
    ['firstSurname', 100],
    ['secondSurname', 100],
    ['phoneNumber', 20],
  ] as const)('enforces the byte limit for %s', async (field, limit) => {
    for (const value of [
      'a'.repeat(limit),
      'á'.repeat(limit / 2),
      '🎬'.repeat(limit / 4),
    ]) {
      await expect(
        validatePayload({ ...validPayload, [field]: value }),
      ).resolves.toEqual([]);
      const errors = await validatePayload({
        ...validPayload,
        [field]: value + 'a',
      });
      expect(errors).toEqual([
        expect.objectContaining({
          property: field,
          constraints: { maxUtf8Bytes: expect.any(String) },
        }),
      ]);
    }
  });

  it('leaves an omitted language undefined for the database default', async () => {
    const client = plainToInstance(CreateClientDto, validPayload);
    await expect(validate(client)).resolves.toEqual([]);
    expect(client.language).toBeUndefined();
  });

  it.each([undefined, 'es', 'en', 'es-CR', 'áéa'])(
    'accepts an omitted or valid language %p',
    async (language) => {
      await expect(
        validatePayload({ ...validPayload, language }),
      ).resolves.toEqual([]);
    },
  );

  it.each([
    null,
    '',
    '   ',
    '\t\n',
    123,
    false,
    [],
    {},
    'abcdef',
    'áéá',
    '\uD800',
  ])('rejects an invalid language %p', async (language) => {
    const errors = await validatePayload({ ...validPayload, language });
    expect(errors.map((error) => error.property)).toEqual(['language']);
  });

  it.each([
    ['email', 'invalid-email'],
    ['email', null],
    ['firstName', '   '],
    ['firstName', undefined],
    ['secondName', 123],
  ])('preserves the inherited validation for %s = %p', async (field, value) => {
    const errors = await validatePayload({ ...validPayload, [field]: value });

    expect(errors.map((error) => error.property)).toEqual([field]);
  });
});
