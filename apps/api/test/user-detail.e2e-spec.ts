import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// Load compiled metadata to exercise the same DTO transformations as production.
const runtime = process
  .getBuiltinModule('node:module')
  .createRequire(__filename);
const { Test } = runtime('@nestjs/testing') as typeof import('@nestjs/testing');
const { ValidationPipe, NotFoundException } = runtime(
  '@nestjs/common',
) as typeof import('@nestjs/common');
const { ConfigModule, ConfigService } = runtime(
  '@nestjs/config',
) as typeof import('@nestjs/config');
const { JwtService } = runtime('@nestjs/jwt') as typeof import('@nestjs/jwt');
const { AuthModule } = runtime(
  '../dist/auth/auth.module.js',
) as typeof import('../src/auth/auth.module');
const { UsersListController } = runtime(
  '../dist/users/users-list.controller.js',
) as typeof import('../src/users/users-list.controller');
const { UsersService } = runtime(
  '../dist/users/users.service.js',
) as typeof import('../src/users/users.service');
const { UsersRepository } = runtime(
  '../dist/users/users.repository.js',
) as typeof import('../src/users/users.repository');
const { ClientsService } = runtime(
  '../dist/clients/clients.service.js',
) as typeof import('../src/clients/clients.service');
const { DatabaseService } = runtime(
  '../dist/database/database.service.js',
) as typeof import('../src/database/database.service');
const { EMPLOYEE_SESSION_COOKIE } = runtime(
  '../dist/auth/employee-session.service.js',
) as typeof import('../src/auth/employee-session.service');

describe('Compiled user details', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  const service = {
    getClientDetail: jest.fn(),
    getEmployeeDetail: jest.fn(),
    listClients: jest.fn(),
  };
  const repository = { findEmployeeIdentityById: jest.fn() };
  const clients = { findById: jest.fn() };
  const client = {
    id: 42,
    role: 'CLIENT',
    firstName: 'Ana',
    secondName: null,
    firstSurname: 'Núñez',
    secondSurname: null,
    birthday: '2000-02-29',
    phoneNumber: null,
    email: 'ana@example.com',
    address: null,
    createdAt: null,
    gender: 'N',
    language: 'es',
  };
  const employee = {
    id: 42,
    role: 'ADMINISTRATOR',
    firstName: 'José',
    secondName: null,
    firstSurname: 'Solano',
    secondSurname: 'Rojas',
    birthday: '1990-01-01',
    phoneNumber: '88888888',
    email: 'jose@example.com',
    address: null,
    createdAt: null,
    branchId: 3,
    branchName: 'Centro',
    hireDate: '2026-10-01',
  };
  const get = (section: string, id: string = '42') =>
    request(app.getHttpServer())
      .get(`/api/users/${section}/${id}`)
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
      );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
      controllers: [UsersListController],
      providers: [{ provide: UsersService, useValue: service }],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          ({ NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:5173' })[key],
        getOrThrow: () => 'detail-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .overrideProvider(ClientsService)
      .useValue(clients)
      .compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'ADMINISTRATOR',
      firstName: 'Ana',
    });
    clients.findById.mockResolvedValue({ id: 99, firstName: 'Cliente' });
    service.getClientDetail.mockResolvedValue(client);
    service.getEmployeeDetail.mockResolvedValue(employee);
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns the selected client after converting the numeric ID', async () => {
    await get('clients').expect(200, client);
    expect(service.getClientDetail).toHaveBeenCalledWith(42);
    expect(service.getEmployeeDetail).not.toHaveBeenCalled();
  });
  it('returns administrator details through the staff route', async () => {
    await get('employees').expect(200, employee);
    expect(service.getEmployeeDetail).toHaveBeenCalledWith(42);
  });
  it('allows employees to view clients while denying staff details', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'EMPLOYEE',
      firstName: 'Ana',
    });
    await get('clients').expect(200, client);
    await get('employees').expect(403);
    expect(service.getEmployeeDetail).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1.5', '1e2', 'CL42', '9007199254740992'])(
    'rejects malformed ID %s',
    async (id) => {
      await get('clients', id).expect(400);
      expect(service.getClientDetail).not.toHaveBeenCalled();
    },
  );
  it.each(['clients', 'employees'])(
    'requires authentication for %s',
    async (section) => {
      await request(app.getHttpServer())
        .get(`/api/users/${section}/42`)
        .expect(401);
    },
  );
  it.each(['clients', 'clients/42', 'employees/42'])(
    'rejects client bearer tokens on %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(`/api/users/${path}`)
        .set('Authorization', `Bearer ${jwt.sign({ sub: 99, type: 'client' })}`)
        .expect(403);
      expect(service.getClientDetail).not.toHaveBeenCalled();
      expect(service.getEmployeeDetail).not.toHaveBeenCalled();
      expect(service.listClients).not.toHaveBeenCalled();
    },
  );
  it('distinguishes a user deleted after selection from an infrastructure failure', async () => {
    service.getClientDetail.mockRejectedValue(
      new NotFoundException('El usuario seleccionado no existe.'),
    );
    await get('clients').expect(404);
    service.getClientDetail.mockRejectedValue(
      new Error('Private SQL and schema'),
    );
    const response = await get('clients').expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
