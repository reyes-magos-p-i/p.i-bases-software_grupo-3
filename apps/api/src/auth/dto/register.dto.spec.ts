import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const validRegistration = (password: string) => ({
  email: 'user@example.com',
  firstName: 'User',
  lastName: 'Example',
  phone: '88881234',
  gender: 'M',
  birthDate: '1990-01-01',
  language: 'es',
  password,
  acceptTerms: true,
});

function dateWithAgeInCostaRica(
  age: number,
  birthDateOffsetDaysFromAnniversary = 0,
): string {
  const today = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Costa_Rica',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts()
      .map(({ type, value }) => [type, value]),
  );
  const date = new Date(
    Date.UTC(
      Number(today.year) - age,
      Number(today.month) - 1,
      Number(today.day) + birthDateOffsetDaysFromAnniversary,
    ),
  );
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

describe('RegisterDto Costa Rican phone validation', () => {
  it('normalizes an 8-digit phone number entered with the standard hyphen', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration('Abcdef1!'),
      phone: '8888-1234',
    });

    const errors = await validate(dto);

    expect(dto.phone).toBe('88881234');
    expect(errors.some((error) => error.property === 'phone')).toBe(false);
  });

  it.each(['1234567', '123456789', '+5068881234', 'abcd1234'])(
    'rejects a phone that is not a Costa Rican 8-digit number: %s',
    async (phone) => {
      const dto = plainToInstance(RegisterDto, {
        ...validRegistration('Abcdef1!'),
        phone,
      });

      const errors = await validate(dto);

      expect(
        errors.find((error) => error.property === 'phone')?.constraints,
      ).toHaveProperty('matches');
    },
  );
});

describe('RegisterDto minimum age validation', () => {
  it('accepts a user on their 18th birthday in Costa Rica', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration('Abcdef1!'),
      birthDate: dateWithAgeInCostaRica(18),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'birthDate')).toBe(false);
  });

  it('accepts a user one day after their 18th birthday', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration('Abcdef1!'),
      birthDate: dateWithAgeInCostaRica(18, -1),
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'birthDate')).toBe(false);
  });

  it('rejects a user whose 18th birthday is tomorrow', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration('Abcdef1!'),
      birthDate: dateWithAgeInCostaRica(18, 1),
    });

    const errors = await validate(dto);

    expect(
      errors.find((error) => error.property === 'birthDate')?.constraints,
    ).toHaveProperty('minimumRegistrationAge');
  });
});

describe('RegisterDto password validation', () => {
  it('normalizes the public registration phone, name and email', async () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration('Abcdef1!'),
      phone: ' 7777-7777 ',
      email: ' User@Example.com ',
      firstName: ' Ana ',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.phone).toBe('77777777');
    expect(dto.email).toBe('user@example.com');
    expect(dto.firstName).toBe('Ana');
  });
  it.each(['2222222', '+1 88888888', '888888888'])(
    'rejects invalid registration phone %s',
    async (phone) => {
      const errors = await validate(
        plainToInstance(RegisterDto, {
          ...validRegistration('Abcdef1!'),
          phone,
        }),
      );
      expect(errors.map((error) => error.property)).toEqual(['phone']);
    },
  );
  it('accepts a password that follows the registration policy', async () => {
    const dto = plainToInstance(RegisterDto, validRegistration('Abcdef1!'));

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'password')).toBe(false);
  });

  it.each([
    'abcdef1!',
    'Abcdefgh!',
    'Abcdefg1',
    'Ab1!',
    `Abcdef1!${'x'.repeat(121)}`,
  ])(
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

    expect(
      errors.find((error) => error.property === 'password')?.constraints,
    ).toHaveProperty('passwordNotPersonalInfo');
  });
});

describe('RegisterDto transform edge cases', () => {
  it('trimLower passes a non-string email through unchanged', () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration('Abcdef1!'),
      email: 99,
    });

    expect(dto.email).toBe(99);
  });

  it('trim passes a non-string firstName through unchanged', () => {
    const dto = plainToInstance(RegisterDto, {
      ...validRegistration('Abcdef1!'),
      firstName: 42,
    });

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
