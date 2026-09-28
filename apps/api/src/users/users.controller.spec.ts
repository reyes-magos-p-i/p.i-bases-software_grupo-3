import {
  BadGatewayException,
  ConflictException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { DatabaseService } from '../database/database.service';
import { EMPLOYEE_SESSION_COOKIE } from '../auth/employee-session.service';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreatedUserDto } from './dto/created-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { CreateUserValidationPipe } from './pipes/create-user-validation.pipe';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UserRole } from './enums/user-role.enum';

describe('UsersController (HTTP integration)', () => {
  let app: INestApplication<App>;
  const service = { create: jest.fn(), getCreationOptions: jest.fn() };
  const repository = { findEmployeeIdentityById: jest.fn() };
  let jwt: JwtService;
  let browser: ReturnType<typeof request.agent>;
  const origin = 'http://localhost:5173';
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
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
      controllers: [UsersController],
      providers: [
        CreateUserValidationPipe,
        { provide: UsersService, useValue: service },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ FRONTEND_URL: origin, NODE_ENV: 'test' })[key],
        getOrThrow: () => 'controller-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => {
    service.getCreationOptions.mockReset().mockResolvedValue({
      provinces: [],
      cantons: [],
      districts: [],
      branches: [],
    });
    browser = request
      .agent(app.getHttpServer())
      .set('Origin', origin)
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
      );
    repository.findEmployeeIdentityById.mockReset().mockResolvedValue({
      id: 21,
      role: UserRole.ADMINISTRATOR,
    });
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

  describe('GET /users/creation-options', () => {
    it('returns all catalogs for an authorized administrator', async () => {
      const options = {
        provinces: [{ id: 1, label: 'San José' }],
        cantons: [{ id: 19, label: 'Curridabat', provinceId: 1 }],
        districts: [{ id: 102, label: 'Curridabat', cantonId: 19 }],
        branches: [{ id: 1, label: 'Sucursal existente' }],
      };
      service.getCreationOptions.mockResolvedValue(options);
      const response = await browser.get('/users/creation-options').expect(200);
      expect(response.body).toEqual(options);
      expect(repository.findEmployeeIdentityById).toHaveBeenCalledWith(21);
      expect(service.getCreationOptions).toHaveBeenCalledTimes(1);
      expect(service.create).not.toHaveBeenCalled();
    });

    it('returns empty lists with 200 when no catalog data exists', async () => {
      const response = await browser.get('/users/creation-options').expect(200);
      expect(response.body).toEqual({
        provinces: [],
        cantons: [],
        districts: [],
        branches: [],
      });
    });

    it('rejects missing authentication before reading catalogs', async () => {
      await request(app.getHttpServer())
        .get('/users/creation-options')
        .expect(401);
      expect(service.getCreationOptions).not.toHaveBeenCalled();
    });

    it.each([{ id: 21, role: UserRole.EMPLOYEE }])(
      'rejects an unauthorized identity %p',
      async (identity) => {
        repository.findEmployeeIdentityById.mockResolvedValue(identity);
        await browser
          .get('/users/creation-options')
          .set('x-user-role', 'ADMINISTRATOR')
          .expect(403);
        expect(service.getCreationOptions).not.toHaveBeenCalled();
      },
    );

    it('returns a generic 500 without leaking database details or partial catalogs', async () => {
      service.getCreationOptions.mockRejectedValue(
        new Error('Private SQL details'),
      );
      const response = await browser.get('/users/creation-options').expect(500);
      expect(response.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  it.each([undefined, 'invalid-token'])(
    'rejects missing or invalid authentication despite forged role headers: %p',
    async (token) => {
      const call = request(app.getHttpServer())
        .post('/users')
        .set('Origin', origin)
        .set('x-user-id', '21')
        .set('x-user-role', 'ADMINISTRATOR');
      if (token) call.set('Cookie', `${EMPLOYEE_SESSION_COOKIE}=${token}`);
      await call.send({ ...employee, role: 'ADMINISTRATOR' }).expect(401);
      expect(repository.findEmployeeIdentityById).not.toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'https://untrusted.example'])(
    'rejects a creation with an unauthorized origin: %p',
    async (source) => {
      const call = request(app.getHttpServer())
        .post('/users')
        .set(
          'Cookie',
          `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
        );
      if (source) call.set('Origin', source);
      await call.send(client).expect(403);
      expect(service.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a deleted employee identity', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue(null);
    await browser.post('/users').send(client).expect(401);
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([{ id: 21, role: UserRole.EMPLOYEE }])(
    'returns 403 when Oracle does not confirm an administrator: %p',
    async (identity) => {
      repository.findEmployeeIdentityById.mockResolvedValue(identity);
      await browser
        .post('/users')
        .set('x-user-id', '999')
        .set('x-user-role', 'ADMINISTRATOR')
        .send({ ...employee, role: 'ADMINISTRATOR' })
        .expect(403);
      expect(repository.findEmployeeIdentityById).toHaveBeenCalledWith(21);
      expect(service.create).not.toHaveBeenCalled();
    },
  );

  it('rejects unauthorized requests before body validation', async () => {
    await request(app.getHttpServer()).post('/users').send({}).expect(401);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('hides identity query failures and never invokes the creation service', async () => {
    repository.findEmployeeIdentityById.mockRejectedValue(
      new Error('Private SQL details'),
    );
    const response = await browser.post('/users').send(client).expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('returns 201 for a client and sends the normalized DTO to the service', async () => {
    const response = await browser.post('/users').send(client).expect(201);

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(repository.findEmployeeIdentityById).toHaveBeenCalledWith(21);
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
      const response = await browser
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
      await browser
        .post('/users')
        .send({ ...client, address })
        .expect(201);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ address }),
      );
    },
  );

  it('returns useful nested errors before invoking the service', async () => {
    const response = await browser
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
    const response = await browser
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
      const response = await browser.post('/users').send(body).expect(400);

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
      const response = await browser
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

    const response = await browser.post('/users').send(client).expect(409);

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

    const response = await browser.post('/users').send(client).expect(502);

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

    const response = await browser.post('/users').send(client).expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(service.create).toHaveBeenCalledTimes(1);
  });
});
