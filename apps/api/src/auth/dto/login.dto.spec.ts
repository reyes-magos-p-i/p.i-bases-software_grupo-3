import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('accepts a valid email and password', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'user@example.com',
      password: 'anything',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('trims and lowercases the email', () => {
    const dto = plainToInstance(LoginDto, {
      email: '  User@Example.com  ',
      password: 'x',
    });

    expect(dto.email).toBe('user@example.com');
  });

  it('leaves a non-string email value as-is (Transform else-branch)', () => {
    const dto = plainToInstance(LoginDto, { email: 123, password: 'x' });

    expect(dto.email).toBe(123);
  });

  it('rejects an invalid email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'not-an-email',
      password: 'x',
    });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects a missing password', async () => {
    const dto = plainToInstance(LoginDto, { email: 'user@example.com' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it.each([
    undefined,
    null,
    '',
    '   ',
    123,
    {},
    [],
    'user@example',
    '\uD800@example.com',
  ])('rejects an invalid email value %p without throwing', async (email) => {
    const dto = plainToInstance(LoginDto, { email, password: 'password' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });

  it.each([150, 151])(
    'enforces the email limit at %i UTF-8 bytes',
    async (bytes) => {
      const email =
        'é'.repeat(20) +
        '@' +
        'a'.repeat(60) +
        '.' +
        'b'.repeat(bytes - 106) +
        '.com';
      expect(Buffer.byteLength(email, 'utf8')).toBe(bytes);
      const dto = plainToInstance(LoginDto, { email, password: 'password' });
      const errors = await validate(dto);
      if (bytes === 150) expect(errors).toEqual([]);
      else
        expect(errors).toEqual([
          expect.objectContaining({
            property: 'email',
            constraints: expect.objectContaining({
              maxUtf8Bytes: expect.any(String),
            }),
          }),
        ]);
    },
  );

  it.each([undefined, null, '', 123, {}, [], 'x'.repeat(129)])(
    'rejects an invalid password value %p',
    async (password) => {
      const dto = plainToInstance(LoginDto, {
        email: 'user@example.com',
        password,
      });
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'password')).toBe(true);
    },
  );

  it.each(['x', '   ', ' Contraseña 🎬 ', 'x'.repeat(128), '🎬'.repeat(128)])(
    'preserves a nonempty password without imposing registration rules: %p',
    async (password) => {
      const dto = plainToInstance(LoginDto, {
        email: 'user@example.com',
        password,
      });
      expect(dto.password).toBe(password);
      expect(await validate(dto)).toEqual([]);
    },
  );
});
