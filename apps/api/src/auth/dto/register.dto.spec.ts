import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const validRegistration = (password: string) => ({
  email: 'user@example.com',
  firstName: 'User',
  lastName: 'Example',
  phone: '1234567890',
  gender: 'M',
  birthDate: '1990-01-01',
  language: 'es',
  password,
  acceptTerms: true,
});

describe('RegisterDto password validation', () => {
  it('accepts a password that follows the registration policy', async () => {
    const dto = plainToInstance(RegisterDto, validRegistration('Abcdef1!'));

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(false);
  });

  it.each(['abcdef1!', 'Abcdefgh!', 'Abcdefg1', 'Ab1!', `Abcdef1!${'x'.repeat(121)}`])(
    'rejects a password outside the registration policy: %s',
    async (password) => {
      const dto = plainToInstance(RegisterDto, validRegistration(password));

      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'password')).toBe(true);
    },
  );

  it('rejects a password equal to personal information', async () => {
    const password = 'Abcdef1!';
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration(password),
      firstName: password,
    });

    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'password')?.constraints)
      .toHaveProperty('passwordNotPersonalInfo');
  });
});

describe('RegisterDto transform edge cases', () => {
  it('trimLower passes a non-string email through unchanged', () => {
    const dto = plainToInstance(RegisterDto, { ...validRegistration('Abcdef1!'), email: 99 });

    expect(dto.email).toBe(99);
  });

  it('trim passes a non-string firstName through unchanged', () => {
    const dto = plainToInstance(RegisterDto, { ...validRegistration('Abcdef1!'), firstName: 42 });

    expect(dto.firstName).toBe(42);
  });

  it('PasswordNotPersonalInfo skips check when password is not a string', async () => {
    const data = { ...validRegistration('Abcdef1!'), password: 12345 };
    const dto = plainToInstance(RegisterDto, data);

    const errors = await validate(dto);
    const pwError = errors.find((e) => e.property === 'password');

    // Custom validator returns true for non-strings, so this constraint must NOT appear
    expect(pwError?.constraints).not.toHaveProperty('passwordNotPersonalInfo');
  });
});