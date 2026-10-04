import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// Exercise the compiled DTO metadata used by Nest in production.
const runtime = process
  .getBuiltinModule('node:module')
  .createRequire(__filename);
const { Test } = runtime('@nestjs/testing') as typeof import('@nestjs/testing');
const { ValidationPipe } = runtime(
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
const { DatabaseService } = runtime(
  '../dist/database/database.service.js',
) as typeof import('../src/database/database.service');
const { EMPLOYEE_SESSION_COOKIE } = runtime(
  '../dist/auth/employee-session.service.js',
) as typeof import('../src/auth/employee-session.service');

describe('Compiled user listing', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  const service = {
    listClients: jest.fn(),
    listEmployees: jest.fn(),
    getEmployeeListOptions: jest.fn(),
  };
  const repository = { findEmployeeIdentityById: jest.fn() };
  const page = {
    items: [
      {
        id: 42,
        name: 'Ana Núñez',
        email: 'ana@example.com',
        phoneNumber: null,
        createdAt: null,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  };
  const get = (path: string) =>
    request(app.getHttpServer())
      .get('/api/users/' + path)
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
        getOrThrow: () => 'compiled-list-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(UsersRepository)
      .useValue(repository)
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
    service.listClients.mockResolvedValue(page);
    service.listEmployees.mockResolvedValue(page);
    service.getEmployeeListOptions.mockResolvedValue({ branches: [] });
  });
  afterAll(async () => {
    await app.close();
  });
  it('returns records and total after converting and validating query parameters', async () => {
    await get('clients')
      .query({ search: 'Ana Núñez', page: '2', pageSize: '25' })
      .expect(200, page);
    expect(service.listClients).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Ana Núñez', page: 2, pageSize: 25 }),
    );
  });
  it('allows employee-only sorting and filters through the compiled DTO', async () => {
    await get('employees')
      .query({ sortBy: 'hireDate', branchId: '3', role: 'EMPLOYEE' })
      .expect(200);
    expect(service.listEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'hireDate',
        branchId: [3],
        role: ['EMPLOYEE'],
      }),
    );
  });
  it('accepts multiple filter values through the compiled HTTP contract', async () => {
    await get('employees')
      .query({ role: 'EMPLOYEE,ADMINISTRATOR', branchId: '3,5' })
      .expect(200);
    expect(service.listEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        role: ['EMPLOYEE', 'ADMINISTRATOR'],
        branchId: [3, 5],
      }),
    );
  });
  it.each([
    { search: ' ' },
    { search: ['Ana', 'Núñez'] },
    { page: '0' },
    { pageSize: '10000' },
    { sortBy: 'passwordHash' },
    { branchId: '1e2' },
    { branchId: '3,1e2' },
    { role: 'EMPLOYEE,CLIENT' },
  ])('rejects invalid parameters before persistence: %p', async (query) => {
    await get('employees').query(query).expect(400);
    expect(service.listEmployees).not.toHaveBeenCalled();
  });
  it('checks the current role for both employee routes while permitting client consultation', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'EMPLOYEE',
      firstName: 'Ana',
    });
    const response = await get('clients').expect(200);
    expect(response.body).toEqual(page);
    expect(service.listClients).toHaveBeenCalledTimes(1);
    await get('employees').expect(403);
    await get('employees/options').expect(403);
    expect(service.listEmployees).not.toHaveBeenCalled();
    expect(service.getEmployeeListOptions).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated consultation', async () => {
    await request(app.getHttpServer()).get('/api/users/clients').expect(401);
    expect(service.listClients).not.toHaveBeenCalled();
  });
});
