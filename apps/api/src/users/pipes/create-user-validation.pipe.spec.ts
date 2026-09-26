import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { CreateClientDto } from '../dto/create-client.dto';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
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
    birthday: '2000-02-29',
    phoneNumber: '+506 8888-8888',
    addressId: 7,
    branchId: 3,
  };

  beforeEach(() => {
    pipe = new CreateUserValidationPipe();
  });

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
      addressId: 7,
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
      addressId: null,
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
        'addressId',
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
    ['addressId', '7'],
    ['addressId', 1.5],
    ['addressId', Number.MAX_SAFE_INTEGER + 1],
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

  it.each(['addressId', 'branchId'])(
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
