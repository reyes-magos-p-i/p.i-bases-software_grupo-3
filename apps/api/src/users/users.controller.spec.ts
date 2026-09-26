import {
  BadGatewayException,
  ConflictException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreatedUserDto } from './dto/created-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { CreateUserValidationPipe } from './pipes/create-user-validation.pipe';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController (HTTP integration)', () => {
  let app: INestApplication<App>;
  const service = { create: jest.fn() };
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
    phoneNumber: '88888888',
    address: { districtId: 7, details: 'Casa azul' },
    branchId: 3,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        CreateUserValidationPipe,
        { provide: UsersService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    service.create
      .mockReset()
      .mockImplementation((data: CreateClientDto | CreateEmployeeDto) =>
        Promise.resolve(
          new CreatedUserDto({ id: 42, role: data.role, email: data.email }),
        ),
      );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 201 for a client and sends the normalized DTO to the service', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .send(client)
      .expect(201);

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.create.mock.calls[0][0]).toBeInstanceOf(CreateClientDto);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ ...client, email: 'cliente@example.com' }),
    );
    expect(response.body).toEqual({
      id: 42,
      role: 'CLIENT',
      email: 'cliente@example.com',
    });
  });

  it.each(['EMPLOYEE', 'ADMINISTRATOR'])(
    'returns 201 for %s with the employee DTO',
    async (role) => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ ...employee, role })
        .expect(201);

      expect(service.create).toHaveBeenCalledTimes(1);
      expect(service.create.mock.calls[0][0]).toBeInstanceOf(CreateEmployeeDto);
      expect(service.create.mock.calls[0][0].address).toBeInstanceOf(
        CreateAddressDto,
      );
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ ...employee, role }),
      );
      expect(response.body).toEqual({ id: 42, role, email: employee.email });
    },
  );

  it.each([null, { districtId: 7 }, { districtId: 7, details: 'Casa azul' }])(
    'accepts a client address %p',
    async (address) => {
      await request(app.getHttpServer())
        .post('/users')
        .send({ ...client, address })
        .expect(201);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ address }),
      );
    },
  );

  it('returns useful nested errors before invoking the service', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .send({
        ...employee,
        address: { details: 123 },
      })
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'El identificador del distrito es obligatorio.',
        'El detalle de la dirección debe ser texto.',
      ]),
    );
  });

  it('rejects unknown nested fields without reflecting their names or values', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .send({
        ...client,
        address: { districtId: 7, 'private-key': 'private-value' },
      })
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
    expect(response.body.message).toEqual([
      'La solicitud contiene campos no permitidos.',
    ]);
  });

  it.each([
    {},
    [],
    { ...client, role: 'ADMIN' },
    { ...client, email: 'private-invalid-email' },
    { ...client, firstName: '   ' },
    { ...employee, branchId: '3' },
    { ...employee, birthday: '2023-02-29' },
    { ...employee, address: null },
    { ...employee, address: [] },
    { ...employee, address: [{ districtId: 7 }] },
    { ...employee, address: { districtId: '7' } },
    { ...client, addressId: 7 },
    { ...client, branchId: 3 },
    { ...client, language: null },
  ])(
    'rejects an invalid request before calling the service: %p',
    async (body) => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send(body)
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
      expect(response.body).toEqual({
        statusCode: 400,
        error: 'Solicitud inválida',
        message: expect.any(Array),
      });
      expect(JSON.stringify(response.body)).not.toContain(
        'private-invalid-email',
      );
    },
  );

  it.each(['password', 'passwordHash', 'salt', 'id'])(
    'rejects the forbidden property %s without reflecting its value',
    async (field) => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ ...client, [field]: 'private-test-value' })
        .expect(400);

      expect(service.create).not.toHaveBeenCalled();
      expect(response.body).toEqual({
        statusCode: 400,
        error: 'Solicitud inválida',
        message: ['La solicitud contiene campos no permitidos.'],
      });
    },
  );

  it('preserves the 409 response for a client email conflict', async () => {
    service.create.mockRejectedValue(
      new ConflictException('Ya existe un cliente con ese correo electrónico.'),
    );

    const response = await request(app.getHttpServer())
      .post('/users')
      .send(client)
      .expect(409);

    expect(response.body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Ya existe un cliente con ese correo electrónico.',
    });
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('preserves the 502 response indicating the account exists but delivery failed', async () => {
    const message =
      'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.';
    service.create.mockRejectedValue(new BadGatewayException(message));

    const response = await request(app.getHttpServer())
      .post('/users')
      .send(client)
      .expect(502);

    expect(response.body).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message,
    });
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('returns a generic 500 without exposing internal error details', async () => {
    service.create.mockRejectedValue(
      new Error('Oracle internal detail: private-password-hash'),
    );

    const response = await request(app.getHttpServer())
      .post('/users')
      .send(client)
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(service.create).toHaveBeenCalledTimes(1);
  });
});
