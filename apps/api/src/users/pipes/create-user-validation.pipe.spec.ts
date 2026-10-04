import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { CreateClientDto } from '../dto/create-client.dto';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { CreateAddressDto } from '../dto/create-address.dto';
import { CreateUserValidationPipe } from './create-user-validation.pipe';

describe('CreateUserValidationPipe', () => {
  let pipe: CreateUserValidationPipe;
  const client = {
    role: 'CLIENT',
    email: 'Cliente@Example.COM',
    firstName: 'Ana',
  };
  const employee = {
    role: 'EMPLOYEE',
    email: 'Empleado@Example.COM',
    firstName: 'José',
    firstSurname: 'Núñez',
    secondSurname: 'Solano',
    hireDate: '2026-10-01',
    birthday: '2000-02-29',
    phoneNumber: '+506 8888-8888',
    address: { districtId: 7, details: 'Casa azul' },
    branchId: 3,
  };

  beforeEach(() => {
    pipe = new CreateUserValidationPipe();
  });

  it.each([undefined, null, '2026-02-30'])(
    'rejects invalid hire dates for new employees: %p',
    async (hireDate) => {
      await expect(pipe.transform({ ...employee, hireDate })).rejects.toThrow(
        BadRequestException,
      );
    },
  );

  const rejection = async (value: unknown): Promise<BadRequestException> => {
    const result: unknown = await pipe
      .transform(value)
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(BadRequestException);
    const exception = result as BadRequestException;
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      statusCode: 400,
      error: 'Solicitud inválida',
      message: expect.any(Array),
    });
    return exception;
  };

  it('creates a validated client instance and lowercases its email', async () => {
    const result = await pipe.transform(client);
    expect(result).toBeInstanceOf(CreateClientDto);
    expect(result).toMatchObject({ ...client, email: 'cliente@example.com' });
  });

  it.each(['CLIENT', 'EMPLOYEE', 'ADMINISTRATOR'])(
    'transforms the nested address for %s and rejects the former addressId field',
    async (role) => {
      const payload = role === 'CLIENT' ? client : employee;
      const address = { districtId: 71, details: 'Casa azul' };
      const result = await pipe.transform({ ...payload, role, address });
      expect(result.address).toBeInstanceOf(CreateAddressDto);
      expect(result.address).toEqual(address);
      const error = await rejection({ ...payload, role, addressId: 7 });
      expect(error.getResponse()).toHaveProperty('message', [
        'La solicitud contiene campos no permitidos.',
      ]);
    },
  );

  it('includes nested validation messages without exposing address data', async () => {
    const error = await rejection({
      ...employee,
      address: {
        districtId: 'private-district',
        details: { secret: 'private-details' },
      },
    });
    expect(error.getResponse()).toHaveProperty(
      'message',
      expect.arrayContaining([
        'El identificador del distrito debe ser un número entero.',
        'El detalle de la dirección debe ser texto.',
      ]),
    );
    const body = JSON.stringify(error.getResponse());
    expect(body).not.toContain('private-district');
    expect(body).not.toContain('private-details');
  });

  it.each(['CLIENT', 'EMPLOYEE', 'ADMINISTRATOR'])(
    'rejects invalid address structures for %s',
    async (role) => {
      for (const address of [
        {},
        [],
        [{ districtId: 7 }],
        { districtId: '7' },
        { districtId: 7, details: 'é'.repeat(128) },
      ]) {
        const error = await rejection({
          ...(role === 'CLIENT' ? client : employee),
          role,
          address,
        });
        const response = error.getResponse() as { message: string[] };
        expect(response.message.length).toBeGreaterThan(0);
      }
    },
  );

  it.each([
    'provinceId',
    'cantonId',
    'id',
    'addressId',
    '__proto__',
    'constructor',
    'prototype',
  ])(
    'rejects an extra nested field %s without disclosing it',
    async (field) => {
      const error = await rejection({
        ...client,
        address: { districtId: 7, [field]: 'private-extra-value' },
      });
      expect(error.getResponse()).toHaveProperty('message', [
        'La solicitud contiene campos no permitidos.',
      ]);
      expect(JSON.stringify(error.getResponse())).not.toContain(
        'private-extra-value',
      );
    },
  );

  it.each(['EMPLOYEE', 'ADMINISTRATOR'])(
    'creates a validated employee instance for %s without changing email casing',
    async (role) => {
      const result = await pipe.transform({ ...employee, role });
      expect(result).toBeInstanceOf(CreateEmployeeDto);
      expect(result).toMatchObject({ ...employee, role });
    },
  );

  it('accepts optional client fields when provided', async () => {
    const fields = {
      secondName: 'María',
      firstSurname: 'Núñez',
      secondSurname: 'Solano',
      birthday: '2000-02-29',
      phoneNumber: '88888888',
      address: { districtId: 7, details: 'Casa azul' },
      language: 'es-CR',
    };
    const result = await pipe.transform({ ...client, ...fields });
    expect(result).toMatchObject(fields);
  });

  it('preserves null for nullable client fields while leaving language undefined', async () => {
    const fields = {
      secondName: null,
      firstSurname: null,
      secondSurname: null,
      birthday: null,
      phoneNumber: null,
      address: null,
    };
    const result = await pipe.transform({ ...client, ...fields });
    expect(result).toMatchObject(fields);
    expect((result as CreateClientDto).language).toBeUndefined();
  });

  it.each([null, undefined])(
    'allows an optional employee second name %p',
    async (secondName) => {
      const result = await pipe.transform({ ...employee, secondName });
      expect(result.secondName).toBe(secondName);
    },
  );

  it.each([undefined, null, {}, [], [client], '', 'text', 7, true])(
    'rejects an invalid body %p',
    async (value) => {
      const error = await rejection(value);
      expect(error.getResponse()).toHaveProperty('message', [
        'El cuerpo de la solicitud debe ser un objeto no vacío.',
      ]);
    },
  );

  it.each([
    undefined,
    null,
    '',
    'ADMIN',
    'client',
    'SUPERADMIN',
    1,
    ['CLIENT'],
    {},
  ])('rejects an absent or unsupported role %p', async (role) => {
    await rejection({ ...client, role });
  });

  it('rejects a request without a role property', async () => {
    await rejection({ email: client.email, firstName: client.firstName });
  });

  it.each(['email', 'firstName'])(
    'requires the common field %s',
    async (field) => {
      const error = await rejection({ ...client, [field]: undefined });
      expect(error.getResponse()).toHaveProperty(
        'message',
        expect.arrayContaining([
          field === 'email'
            ? 'El correo electrónico es obligatorio.'
            : 'El primer nombre es obligatorio.',
        ]),
      );
    },
  );

  it.each(['EMPLOYEE', 'ADMINISTRATOR'])(
    'enforces all required fields for %s',
    async (role) => {
      for (const field of [
        'firstSurname',
        'secondSurname',
        'birthday',
        'phoneNumber',
        'address',
        'branchId',
      ]) {
        await rejection({ ...employee, role, [field]: undefined });
        await rejection({ ...employee, role, [field]: null });
      }
    },
  );

  it.each([
    ['email', 123],
    ['firstName', false],
    ['secondName', {}],
    ['firstSurname', []],
    ['phoneNumber', 88888888],
    ['address', '7'],
    ['address', 1.5],
    ['address', Number.MAX_SAFE_INTEGER + 1],
    ['birthday', '2023-02-29'],
    ['birthday', '2000-02-29T00:00:00Z'],
    ['firstName', 'á'.repeat(51)],
    ['email', '\uD800@example.com'],
    ['language', null],
    ['language', ''],
    ['language', 'abcdef'],
  ])(
    'rejects invalid client data in %s without coercion',
    async (field, value) => {
      await rejection({ ...client, [field]: value });
    },
  );

  it.each(['address', 'branchId'])(
    'does not coerce an employee %s into a number',
    async (field) => {
      await rejection({ ...employee, [field]: '7' });
    },
  );

  it.each(['CLIENT', 'EMPLOYEE', 'ADMINISTRATOR'])(
    'rejects extra fields for %s without exposing their names or values',
    async (role) => {
      const payload = role === 'CLIENT' ? client : employee;
      for (const field of [
        'password',
        'passwordHash',
        'salt',
        'id',
        'clientId',
        'employeeId',
        'gender',
        'acceptedTermsAt',
        'private-extra-field',
      ]) {
        const error = await rejection({
          ...payload,
          role,
          [field]: 'sensitive-test-value',
        });
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          error: 'Solicitud inválida',
          message: ['La solicitud contiene campos no permitidos.'],
        });
        const body = JSON.stringify(error.getResponse());
        expect(body).not.toContain('sensitive-test-value');
      }
    },
  );

  it('rejects branchId for clients and language for employees', async () => {
    await rejection({ ...client, branchId: 3 });
    await rejection({ ...employee, language: 'es' });
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects the reserved own property %s before transformation can strip it',
    async (field) => {
      const error = await rejection({
        ...client,
        [field]: { privateValue: 'secret' },
      });
      expect(error.getResponse()).toHaveProperty('message', [
        'La solicitud contiene campos no permitidos.',
      ]);
    },
  );

  it('returns DTO messages without exposing invalid values or validation targets', async () => {
    const error = await rejection({
      ...client,
      email: 'private-invalid-email',
      phoneNumber: { privateValue: 'private-phone' },
    });
    const body = JSON.stringify(error.getResponse());
    expect(body).not.toContain('private-invalid-email');
    expect(body).not.toContain('private-phone');
    expect(body).not.toContain('target');
    expect(body).not.toContain('value');
    expect(error.getResponse()).toHaveProperty(
      'message',
      expect.arrayContaining([
        'El correo electrónico debe tener un formato válido.',
        'El teléfono debe ser texto.',
      ]),
    );
  });
});
