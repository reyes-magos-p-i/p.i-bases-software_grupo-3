import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../auth/auth.module';
import { EMPLOYEE_SESSION_COOKIE } from '../auth/employee-session.service';
import { DatabaseService } from '../database/database.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersListController } from './users-list.controller';
import {
  ListClientsQueryDto,
  ListEmployeesQueryDto,
} from './dto/list-users-query.dto';

describe('User list HTTP permissions and validation', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  const service = {
    listClients: jest.fn(),
    listEmployees: jest.fn(),
    getEmployeeListOptions: jest.fn(),
  };
  const repository = { findEmployeeIdentityById: jest.fn() };
  const empty = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  const get = (path: string) =>
    request(app.getHttpServer())
      .get(path)
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
        getOrThrow: () => 'list-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication({ logger: false });
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
    service.listClients.mockResolvedValue(empty);
    service.listEmployees.mockResolvedValue(empty);
    service.getEmployeeListOptions.mockResolvedValue({ branches: [] });
  });
  afterAll(async () => {
    await app.close();
  });
  it.each(['/users/clients', '/users/employees', '/users/employees/options'])(
    'requires a verified session for %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .set('x-user-role', 'ADMINISTRATOR')
        .expect(401);
      expect(service.listClients).not.toHaveBeenCalled();
      expect(service.listEmployees).not.toHaveBeenCalled();
      expect(service.getEmployeeListOptions).not.toHaveBeenCalled();
    },
  );
  it.each(['EMPLOYEE', 'ADMINISTRATOR'])(
    'allows %s to read clients without requiring Origin',
    async (role) => {
      repository.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role,
        firstName: 'Ana',
      });
      await get('/users/clients').expect(200, empty);
      expect(service.listClients.mock.calls[0][0]).toBeInstanceOf(
        ListClientsQueryDto,
      );
    },
  );
  it('allows administrators to read employees and branch options', async () => {
    await get('/users/employees')
      .query({
        page: '2',
        pageSize: '25',
        sortBy: 'hireDate',
        role: 'EMPLOYEE',
        branchId: '3',
      })
      .expect(200);
    expect(service.listEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 25,
        branchId: [3],
        role: ['EMPLOYEE'],
      }),
    );
    expect(service.listEmployees.mock.calls[0][0]).toBeInstanceOf(
      ListEmployeesQueryDto,
    );
    await get('/users/employees/options').expect(200, { branches: [] });
  });
  it('transforms multiple selected branches and roles before querying', async () => {
    await get('/users/employees')
      .query({ branchId: '3,5', role: 'EMPLOYEE,ADMINISTRATOR' })
      .expect(200);
    expect(service.listEmployees).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: [3, 5],
        role: ['EMPLOYEE', 'ADMINISTRATOR'],
      }),
    );
  });
  it.each(['/users/employees', '/users/employees/options'])(
    'rejects employees before querying %s',
    async (path) => {
      repository.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role: 'EMPLOYEE',
        firstName: 'Ana',
      });
      await get(path).set('x-user-role', 'ADMINISTRATOR').expect(403);
      expect(service.listEmployees).not.toHaveBeenCalled();
      expect(service.getEmployeeListOptions).not.toHaveBeenCalled();
    },
  );
  it.each([
    { page: '0' },
    { pageSize: '1000' },
    { search: ' ' },
    { search: ['Ana', 'María'] },
    { sortBy: 'passwordHash' },
    { privateField: 'privateValue' },
    { role: 'CLIENT' },
    { role: 'EMPLOYEE,CLIENT' },
    { branchId: '3,0' },
    { branchId: '3,3' },
  ])('reports malformed parameters before querying: %p', async (query) => {
    await get('/users/employees').query(query).expect(400);
    expect(service.listEmployees).not.toHaveBeenCalled();
  });
  it('reports zero matches as a successful result with a count', async () => {
    await get('/users/clients')
      .query({ search: 'Sin coincidencias' })
      .expect(200, empty);
  });
  it('rejects identities deleted since login', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue(null);
    await get('/users/clients').expect(401);
    expect(service.listClients).not.toHaveBeenCalled();
  });
  it('does not reveal database errors in responses', async () => {
    service.listClients.mockRejectedValue(
      new Error('Private Oracle schema and query'),
    );
    const response = await get('/users/clients').expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
