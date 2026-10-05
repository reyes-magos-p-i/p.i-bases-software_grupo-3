import {
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../auth/auth.module';
import { EmailVerificationSender } from '../auth/notifications/email-verification-sender';
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
    getClientDetail: jest.fn(),
    getEmployeeDetail: jest.fn(),
    listClients: jest.fn(),
    listEmployees: jest.fn(),
    getEmployeeListOptions: jest.fn(),
  };
  const repository = { findEmployeeIdentityById: jest.fn() };
  const clients = {
    findById: jest.fn(),
    isEmailVerificationPending: jest.fn(),
  };
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
      .overrideProvider(EmailVerificationSender)
      .useValue({ send: jest.fn() })
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .overrideProvider(ClientsService)
      .useValue(clients)
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
    service.getClientDetail.mockResolvedValue({
      id: 42,
      role: 'CLIENT',
      firstName: 'Ana',
    });
    service.getEmployeeDetail.mockResolvedValue({
      id: 42,
      role: 'EMPLOYEE',
      firstName: 'José',
    });
    clients.findById.mockResolvedValue({ id: 99, firstName: 'Cliente' });
    clients.isEmailVerificationPending.mockResolvedValue(false);
  });
  afterAll(async () => {
    await app.close();
  });
  it.each(['EMPLOYEE', 'ADMINISTRATOR'])(
    'allows %s to view the selected client',
    async (role) => {
      repository.findEmployeeIdentityById.mockResolvedValue({ id: 21, role });
      await get('/users/clients/42').expect(200, {
        id: 42,
        role: 'CLIENT',
        firstName: 'Ana',
      });
      expect(service.getClientDetail).toHaveBeenCalledWith(42);
      expect(service.getEmployeeDetail).not.toHaveBeenCalled();
    },
  );
  it('allows administrators to view staff but rejects employees', async () => {
    await get('/users/employees/42').expect(200);
    expect(service.getEmployeeDetail).toHaveBeenCalledWith(42);
    service.getEmployeeDetail.mockClear();
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'EMPLOYEE',
    });
    await get('/users/employees/42').expect(403);
    expect(service.getEmployeeDetail).not.toHaveBeenCalled();
  });
  it.each(['/users/clients', '/users/clients/42', '/users/employees/42'])(
    'rejects client bearer tokens on %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${jwt.sign({ sub: 99, type: 'client' })}`)
        .expect(403);
      expect(service.getClientDetail).not.toHaveBeenCalled();
      expect(service.getEmployeeDetail).not.toHaveBeenCalled();
      expect(service.listClients).not.toHaveBeenCalled();
    },
  );
  it.each(['0', '-1', '1.5', '1e2', 'CL42', '9007199254740992'])(
    'rejects invalid detail IDs before querying: %s',
    async (id) => {
      await get('/users/clients/' + id).expect(400);
      expect(service.getClientDetail).not.toHaveBeenCalled();
    },
  );
  it('reports users deleted after selection with 404', async () => {
    service.getClientDetail.mockRejectedValue(
      new NotFoundException('El usuario seleccionado no existe.'),
    );
    const response = await get('/users/clients/42').expect(404);
    expect(response.body.message).toBe('El usuario seleccionado no existe.');
  });
  it.each(['/users/clients/42', '/users/employees/42'])(
    'does not expose details without a session on %s',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(401);
      expect(response.body.statusCode).toBe(401);
      expect(service.getClientDetail).not.toHaveBeenCalled();
      expect(service.getEmployeeDetail).not.toHaveBeenCalled();
    },
  );
  it('normalizes repeated search whitespace before querying', async () => {
    await get('/users/clients').query({ search: '  Ana  Núñez  ' }).expect(200);
    expect(service.listClients).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Ana Núñez' }),
    );
  });
  it('keeps infrastructure errors private on detail endpoints', async () => {
    service.getEmployeeDetail.mockRejectedValue(
      new Error('Private Oracle query'),
    );
    const response = await get('/users/employees/42').expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
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
    const response = await get('/users/clients')
      .query({ search: 'Sin coincidencias' })
      .expect(200, empty);
    expect(response.body).toEqual(empty);
    expect(service.listClients).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Sin coincidencias' }),
    );
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
