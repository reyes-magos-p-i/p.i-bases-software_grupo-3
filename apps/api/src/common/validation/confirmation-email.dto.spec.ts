import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmationEmailDto } from './confirmation-email.dto';

describe('Confirmation email input', () => {
  it('normalizes the email with the existing user validation rules', async () => {
    const value = plainToInstance(ConfirmationEmailDto, {
      email: ' Admin@Example.com ',
    });
    expect(await validate(value)).toEqual([]);
    expect(value.email).toBe('admin@example.com');
  });
  it.each([
    undefined,
    null,
    '',
    '   ',
    'invalid',
    42,
    [],
    {},
    '\ud800@example.com',
    'a'.repeat(151) + '@example.com',
  ])('rejects an invalid email without throwing: %p', async (email) => {
    const errors = await validate(
      plainToInstance(ConfirmationEmailDto, { email }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('email');
  });
});
