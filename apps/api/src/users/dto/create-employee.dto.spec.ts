import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

describe('CreateEmployeeDto', () => {
  const validPayload = {
    role: 'EMPLOYEE',
    email: 'empleado@example.com',
    firstName: 'José',
    firstSurname: 'Núñez',
    secondSurname: 'Solano',
    birthday: '2000-02-29',
    hireDate: '2026-10-01',
    phoneNumber: '+506 8888-8888',
    address: { districtId: 1 },
    branchId: 2,
  };

  const validatePayload = (payload: Record<string, unknown>) =>
    validate(plainToInstance(CreateEmployeeDto, payload));

  it.each([
    undefined,
    null,
    '',
    '2026-02-30',
    '0000-01-01',
    '2026-10-01T00:00:00Z',
    '01/10/2026',
  ])('rejects a missing or invalid hire date %p', async (hireDate) => {
    const errors = await validatePayload({ ...validPayload, hireDate });
    expect(errors.map((error) => error.property)).toContain('hireDate');
  });

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

  it.each(['ADMINISTRATOR', 'EMPLOYEE'])(
    'accepts a valid %s profile',
    async (role) => {
      await expect(validatePayload({ ...validPayload, role })).resolves.toEqual(
        [],
      );
    },
  );

  it.each([undefined, null, 'Carlos'])(
    'keeps the second name optional with value %p',
    async (secondName) => {
      await expect(
        validatePayload({ ...validPayload, secondName }),
      ).resolves.toEqual([]);
    },
  );

  it.each(['CLIENT', 'ADMIN', 'SUPERADMIN', 'admin', 1, undefined, null])(
    'rejects an unsupported or missing role %p',
    async (role) => {
      const errors = await validatePayload({ ...validPayload, role });

      expect(errors).toEqual([
        expect.objectContaining({
          property: 'role',
          constraints: expect.objectContaining({
            isIn: 'El rol debe ser administrador o empleado.',
          }),
        }),
      ]);
    },
  );

  it.each([
    'firstSurname',
    'secondSurname',
    'birthday',
    'phoneNumber',
    'address',
    'branchId',
  ])('requires %s', async (field) => {
    for (const value of [undefined, null]) {
      const errors = await validatePayload({ ...validPayload, [field]: value });

      expect(errors).toEqual([
        expect.objectContaining({
          property: field,
          constraints: expect.objectContaining({
            isDefined: expect.any(String),
          }),
        }),
      ]);
    }
  });

  it.each(['firstSurname', 'secondSurname', 'phoneNumber'])(
    'rejects blank or non-string values for %s',
    async (field) => {
      for (const value of ['', ' \t\n', 123, false, [], {}]) {
        const errors = await validatePayload({
          ...validPayload,
          [field]: value,
        });

        expect(errors.map((error) => error.property)).toEqual([field]);
      }
    },
  );

  it('requires a branch for administrators too', async () => {
    const errors = await validatePayload({
      ...validPayload,
      role: 'ADMINISTRATOR',
      branchId: undefined,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'branchId',
        constraints: expect.objectContaining({
          isDefined: 'El identificador de la sucursal es obligatorio.',
        }),
      }),
    ]);
  });

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

  it.each(['branchId'])(
    'rejects non-integer, non-numeric or unsafe values for %s',
    async (field) => {
      for (const value of [
        1.5,
        '1',
        false,
        NaN,
        Infinity,
        Number.MIN_SAFE_INTEGER - 1,
        Number.MAX_SAFE_INTEGER + 1,
      ]) {
        const errors = await validatePayload({
          ...validPayload,
          [field]: value,
        });

        expect(errors.map((error) => error.property)).toEqual([field]);
      }
    },
  );

  it.each(['branchId'])(
    'accepts safe integer boundaries for %s',
    async (field) => {
      for (const value of [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) {
        await expect(
          validatePayload({ ...validPayload, [field]: value }),
        ).resolves.toEqual([]);
      }
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

  it('preserves the casing of employee email addresses', async () => {
    const employee = plainToInstance(CreateEmployeeDto, {
      ...validPayload,
      email: 'Persona@Example.com',
    });
    await expect(validate(employee)).resolves.toEqual([]);
    expect(employee.email).toBe('Persona@Example.com');
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
