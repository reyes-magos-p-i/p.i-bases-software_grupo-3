import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestPasswordRecoveryDto } from './request-password-recovery.dto';
import { ValidatePasswordRecoveryDto } from './validate-password-recovery.dto';
import { ResetPasswordDto } from './reset-password.dto';

describe('Password recovery input', () => {
  it('normalizes the email and accepts personnel or client accounts', async () => {
    const input = plainToInstance(RequestPasswordRecoveryDto, {
      email: ' ANA@Example.COM ',
      accountType: 'employee',
    });
    expect(input.email).toBe('ana@example.com');
    await expect(validate(input)).resolves.toEqual([]);
  });

  it.each([
    { email: 'invalid', accountType: 'client' },
    { email: 'a@example.com', accountType: 'admin' },
    { email: 'a'.repeat(151), accountType: 'client' },
    { email: 42, accountType: 'client' },
  ])('rejects invalid requests %p', async (input) => {
    const errors = await validate(
      plainToInstance(RequestPasswordRecoveryDto, input),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each(['', 'a'.repeat(63), 'g'.repeat(64), 42])(
    'rejects malformed token %p',
    async (token) => {
      const errors = await validate(
        plainToInstance(ValidatePasswordRecoveryDto, { token }),
      );
      expect(errors.map((error) => error.property)).toContain('token');
    },
  );

  it('accepts a complete reset without trimming the passwords', async () => {
    const input = plainToInstance(ResetPasswordDto, {
      token: 'a'.repeat(64),
      temporaryPassword: ' temporary ',
      newPassword: ' secret ',
      confirmNewPassword: ' secret ',
      expirationDays: 90,
    });
    await expect(validate(input)).resolves.toEqual([]);
    expect(input.temporaryPassword).toBe(' temporary ');
  });

  it.each([
    'token',
    'temporaryPassword',
    'newPassword',
    'confirmNewPassword',
    'expirationDays',
  ])('requires %s', async (field) => {
    const input: Record<string, unknown> = {
      token: 'a'.repeat(64),
      temporaryPassword: 'temp',
      newPassword: 'secret',
      confirmNewPassword: 'secret',
      expirationDays: 90,
    };
    delete input[field];
    const errors = await validate(plainToInstance(ResetPasswordDto, input));
    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('rejects oversized passwords and unsupported expiration', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        temporaryPassword: 'x'.repeat(129),
        newPassword: 'x'.repeat(129),
        confirmNewPassword: 'x'.repeat(129),
        expirationDays: 91,
      }),
    );
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'temporaryPassword',
        'newPassword',
        'confirmNewPassword',
        'expirationDays',
      ]),
    );
  });
});
