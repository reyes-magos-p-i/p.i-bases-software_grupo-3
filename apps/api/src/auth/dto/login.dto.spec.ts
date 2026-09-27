import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('accepts a valid email and password', async () => {
    const dto = plainToInstance(LoginDto, { email: 'user@example.com', password: 'anything' });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('trims and lowercases the email', () => {
    const dto = plainToInstance(LoginDto, { email: '  User@Example.com  ', password: 'x' });

    expect(dto.email).toBe('user@example.com');
  });

  it('rejects an invalid email', async () => {
    const dto = plainToInstance(LoginDto, { email: 'not-an-email', password: 'x' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects a missing password', async () => {
    const dto = plainToInstance(LoginDto, { email: 'user@example.com' });

    const errors = await validate(dto);

    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});