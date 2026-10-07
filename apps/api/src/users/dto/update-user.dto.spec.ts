import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateClientDto, UpdateEmployeeDto } from './update-user.dto';

describe('User update validation', () => {
  it.each([null, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])(
    'rejects staff branch %p',
    async (branchId) => {
      const errors = await validate(
        plainToInstance(UpdateEmployeeDto, { branchId }),
      );
      expect(errors.map((error) => error.property)).toEqual(['branchId']);
    },
  );
  it('accepts a positive staff branch without requiring other changes', async () => {
    expect(
      await validate(plainToInstance(UpdateEmployeeDto, { branchId: 6 })),
    ).toEqual([]);
  });
  it.each([UpdateClientDto, UpdateEmployeeDto])(
    'normalizes names and supports clearing a second name',
    async (Dto) => {
      const data = plainToInstance(Dto, {
        firstName: ' Ana ',
        secondName: ' ',
        firstSurname: ' Núñez ',
        secondSurname: ' Rojas ',
      });
      expect(await validate(data)).toEqual([]);
      expect(data.firstName).toBe('Ana');
      expect(data.secondName).toBeNull();
      expect(data.firstSurname).toBe('Núñez');
      expect(data.secondSurname).toBe('Rojas');
    },
  );
  it.each(['', ' ', null, false, 'é'.repeat(51), 'bad\uD800'])(
    'rejects invalid first name %p',
    async (firstName) => {
      expect(
        await validate(plainToInstance(UpdateClientDto, { firstName })),
      ).not.toEqual([]);
      expect(
        await validate(plainToInstance(UpdateEmployeeDto, { firstName })),
      ).not.toEqual([]);
    },
  );
  it('accepts optional client surnames but requires staff surnames when sent', async () => {
    const client = plainToInstance(UpdateClientDto, {
      firstSurname: '',
      secondSurname: null,
    });
    expect(await validate(client)).toEqual([]);
    expect(client.firstSurname).toBeNull();
    for (const surname of ['', ' ', null]) {
      const employee = plainToInstance(UpdateEmployeeDto, {
        firstSurname: surname,
        secondSurname: surname,
      });
      expect(
        (await validate(employee)).map((error) => error.property).sort(),
      ).toEqual(['firstSurname', 'secondSurname']);
    }
  });
  it.each(['secondName', 'firstSurname', 'secondSurname'])(
    'validates Unicode and length of %s',
    async (field) => {
      expect(
        await validate(
          plainToInstance(UpdateClientDto, { [field]: 'é'.repeat(50) }),
        ),
      ).toEqual([]);
      expect(
        await validate(
          plainToInstance(UpdateEmployeeDto, { [field]: 'é'.repeat(51) }),
        ),
      ).not.toEqual([]);
      expect(
        await validate(plainToInstance(UpdateClientDto, { [field]: 12 })),
      ).not.toEqual([]);
    },
  );
  it('normalizes email and a formatted Costa Rican cellphone', async () => {
    const data = plainToInstance(UpdateEmployeeDto, {
      email: ' Ana@Example.com ',
      phoneNumber: '+506 8888-8888',
    });
    expect(await validate(data)).toEqual([]);
    expect(data.email).toBe('ana@example.com');
    expect(data.phoneNumber).toBe('88888888');
  });
  it.each(['6888-8888', '7888 8888', '88888888', '+50688888888'])(
    'accepts formatted cellphone %s',
    async (phoneNumber) => {
      expect(
        await validate(plainToInstance(UpdateClientDto, { phoneNumber })),
      ).toEqual([]);
    },
  );
  it.each([
    '',
    '1234',
    '22222222',
    '888888888',
    '+1 88888888',
    '8888abc8888',
    false,
    88888888,
  ])('rejects invalid cellphone %p', async (phoneNumber) => {
    expect(
      await validate(plainToInstance(UpdateClientDto, { phoneNumber })),
    ).not.toEqual([]);
  });
  it('allows clearing optional client contact fields but not staff fields', async () => {
    expect(
      await validate(
        plainToInstance(UpdateClientDto, { phoneNumber: null, address: null }),
      ),
    ).toEqual([]);
    const errors = await validate(
      plainToInstance(UpdateEmployeeDto, {
        phoneNumber: null,
        address: null,
        role: null,
        email: null,
      }),
    );
    expect(errors.map((error) => error.property).sort()).toEqual([
      'address',
      'email',
      'phoneNumber',
      'role',
    ]);
  });
  it('allows omission of unchanged fields', async () => {
    expect(await validate(new UpdateClientDto())).toEqual([]);
    expect(await validate(new UpdateEmployeeDto())).toEqual([]);
  });
  it.each([
    '',
    '   ',
    null,
    1,
    'ana@example',
    'bad\uD800@example.com',
    'é'.repeat(100) + '@example.com',
  ])('rejects invalid email %p', async (email) => {
    expect(
      await validate(plainToInstance(UpdateClientDto, { email })),
    ).not.toEqual([]);
  });
  it.each(['CLIENT', '', 'administrator', null, 2])(
    'rejects staff role %p',
    async (role) => {
      expect(
        await validate(plainToInstance(UpdateEmployeeDto, { role })),
      ).not.toEqual([]);
    },
  );
  it.each(['EMPLOYEE', 'ADMINISTRATOR'])(
    'accepts staff role %s',
    async (role) => {
      expect(
        await validate(plainToInstance(UpdateEmployeeDto, { role })),
      ).toEqual([]);
    },
  );
  it('validates the existing address byte limit and nested district', async () => {
    expect(
      await validate(
        plainToInstance(UpdateClientDto, {
          address: { districtId: 7, details: 'a'.repeat(255) },
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(UpdateEmployeeDto, {
          address: { districtId: 7, details: null },
        }),
      ),
    ).toEqual([]);
  });
  it.each([
    { districtId: 0 },
    { districtId: 1.5 },
    {},
    [],
    'Casa',
    { districtId: 7, details: 'é'.repeat(128) },
  ])('rejects invalid address %p', async (address) => {
    expect(
      await validate(plainToInstance(UpdateClientDto, { address })),
    ).not.toEqual([]);
  });
  it('rejects immutable and unsupported fields rather than dropping them silently', async () => {
    const errors = await validate(
      plainToInstance(UpdateClientDto, {
        birthday: '2000-01-01',
        gender: 'F',
        password: 'secret',
        role: 'CLIENT',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property).sort()).toEqual([
      'birthday',
      'gender',
      'password',
      'role',
    ]);
  });
});
