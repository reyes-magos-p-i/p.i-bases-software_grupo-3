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