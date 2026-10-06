import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserBaseDto } from './create-user-base.dto';

describe('CreateUserBaseDto', () => {
  const validPayload = {
    role: 'CLIENT',
    email: 'cliente@example.com',
    firstName: 'José María',
  };

  const validatePayload = (payload: Record<string, unknown>) =>
    validate(plainToInstance(CreateUserBaseDto, payload));

  it('accepts valid required fields without a second name', async () => {
    await expect(validatePayload(validPayload)).resolves.toEqual([]);
  });

  it.each(['ADMINISTRATOR', 'EMPLOYEE', 'CLIENT'])(
    'accepts the role %s',
    async (role) => {
      await expect(validatePayload({ ...validPayload, role })).resolves.toEqual(
        [],
      );
    },
  );

  it.each([undefined, null])('rejects a missing role %p', async (role) => {
    const errors = await validatePayload({ ...validPayload, role });

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'role',
        constraints: expect.objectContaining({
          isDefined: 'El rol es obligatorio.',
        }),
      }),
    ]);
  });

  it.each([
    '',
    '   ',
    'admin',
    'ADMIN',
    'SUPERADMIN',
    1,
    false,
    ['ADMINISTRATOR'],
    { role: 'ADMINISTRATOR' },
  ])('rejects an invalid role %p with a Spanish message', async (role) => {
    const errors = await validatePayload({ ...validPayload, role });

    expect(errors).toEqual([
      expect.objectContaining({
        property: 'role',
        constraints: {
          isEnum: 'El rol debe ser administrador, empleado o cliente.',
        },
      }),
    ]);
  });

  it.each([undefined, null, '', 'Lucía'])(
    'accepts an optional second name with value %p',
    async (secondName) => {
      await expect(
        validatePayload({ ...validPayload, secondName }),
      ).resolves.toEqual([]);
    },
  );

  it.each([
    ['email', undefined],
    ['email', null],
    ['firstName', undefined],
    ['firstName', null],
  ])('rejects %s when its value is %p', async (field, value) => {
    const errors = await validatePayload({ ...validPayload, [field]: value });

    expect(errors).toEqual([
      expect.objectContaining({
        property: field,
        constraints: expect.objectContaining({ isDefined: expect.any(String) }),
      }),
    ]);
  });

  it.each([
    ['email', 123],
    ['email', ['cliente@example.com']],
    ['firstName', false],
    ['firstName', ['Ana']],
    ['secondName', 123],
    ['secondName', { name: 'Ana' }],
  ])('rejects a non-string %s with value %p', async (field, value) => {
    const errors = await validatePayload({ ...validPayload, [field]: value });

    expect(errors).toEqual([
      expect.objectContaining({
        property: field,
        constraints: expect.objectContaining({ isString: expect.any(String) }),
      }),
    ]);
  });

  it.each(['', 'cliente.example.com', 'cliente@', '@example.com'])(
    'rejects an invalid email %p with a Spanish message',
    async (email) => {
      const errors = await validatePayload({ ...validPayload, email });

      expect(errors).toEqual([
        expect.objectContaining({
          property: 'email',
          constraints: {
            isEmail: 'El correo electrónico debe tener un formato válido.',
          },
        }),
      ]);
    },
  );

  it.each(['firstName', 'secondName'])(
    'enforces the UTF-8 byte limit for %s',
    async (field) => {
      for (const value of ['a'.repeat(100), 'á'.repeat(50), '🎬'.repeat(25)]) {
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
            constraints: expect.objectContaining({
              maxUtf8Bytes: expect.any(String),
            }),
          }),
        ]);
      }
    },
  );

  it('enforces the 150-byte email limit independently of valid email syntax', async () => {
    const domain = 'b'.repeat(63) + '.' + 'c'.repeat(30) + '.com';
    const email = 'a'.repeat(51) + '@' + domain;

    await expect(validatePayload({ ...validPayload, email })).resolves.toEqual(
      [],
    );
    const errors = await validatePayload({
      ...validPayload,
      email: 'a' + email,
    });
    expect(errors).toEqual([
      expect.objectContaining({
        property: 'email',
        constraints: { maxUtf8Bytes: expect.any(String) },
      }),
    ]);
  });

  it.each(['email', 'firstName', 'secondName'])(
    'rejects malformed Unicode in %s',
    async (field) => {
      const errors = await validatePayload({
        ...validPayload,
        [field]: '\uD800',
      });
      expect(errors).toEqual([
        expect.objectContaining({
          property: field,
          constraints: expect.objectContaining({
            maxUtf8Bytes: expect.any(String),
          }),
        }),
      ]);
    },
  );

  it.each(['a\uD800@example.com', 'a@example\uDC00.com'])(
    'rejects malformed Unicode in either part of an email: %p',
    async (email) => {
      const errors = await validatePayload({ ...validPayload, email });
      expect(errors).toEqual([
        expect.objectContaining({
          property: 'email',
          constraints: expect.objectContaining({
            isEmail: expect.any(String),
            maxUtf8Bytes: expect.any(String),
          }),
        }),
      ]);
    },
  );

  it.each(['', '   ', '\t\n', '\u00a0'])(
    'rejects an empty or whitespace-only first name %p',
    async (firstName) => {
      const errors = await validatePayload({ ...validPayload, firstName });

      expect(errors).toEqual([
        expect.objectContaining({
          property: 'firstName',
          constraints: {
            matches:
              'El primer nombre no puede estar vacío ni contener solo espacios.',
          },
        }),
      ]);
    },
  );
});
