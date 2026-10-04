import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// Compiled decorators preserve the DTO metadata used by the production validation pipe.
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
const { UsersUpdateController } = runtime(
  '../dist/users/users-update.controller.js',
) as typeof import('../src/users/users-update.controller');
const { UsersService } = runtime(
  '../dist/users/users.service.js',
) as typeof import('../src/users/users.service');
const { UsersRepository } = runtime(
  '../dist/users/users.repository.js',
) as typeof import('../src/users/users.repository');
const { ClientsRepository } = runtime(
  '../dist/clients/clients.repository.js',
) as typeof import('../src/clients/clients.repository');
const { DatabaseService } = runtime(
  '../dist/database/database.service.js',
) as typeof import('../src/database/database.service');
const { PasswordGenerator } = runtime(
  '../dist/common/security/password-generator.js',
) as typeof import('../src/common/security/password-generator');
const { PasswordHasher } = runtime(
  '../dist/common/security/password-hasher.js',
) as typeof import('../src/common/security/password-hasher');
const { InitialCredentialsSender } = runtime(
  '../dist/users/notifications/initial-credentials-sender.js',
) as typeof import('../src/users/notifications/initial-credentials-sender');
const { EMPLOYEE_SESSION_COOKIE } = runtime(
  '../dist/auth/employee-session.service.js',
) as typeof import('../src/auth/employee-session.service');

const { UsersListController } = runtime(
  '../dist/users/users-list.controller.js',
) as typeof import('../src/users/users-list.controller');
type Account = {
  id: number;
  role: 'ADMINISTRATOR' | 'EMPLOYEE' | 'CLIENT';
  active: boolean;
  email: string;
};
type Binds = Record<string, number | string | { val: number | string }>;
describe('Compiled user deactivation lifecycle', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  let accounts: Account[];
  const origin = 'http://localhost:5173';
  const statements: string[] = [];
  const value = (binds: Binds, key: string) => {
    const bind = binds[key];
    return typeof bind === 'object' ? bind.val : bind;
  };
  const execute = jest.fn((sql: string, binds: Binds = {}) => {
    statements.push(sql);
    const upper = sql.toUpperCase();
    if (upper.startsWith('LOCK TABLE')) return Promise.resolve({});
    const staff = upper.includes('EMPLOYEES');
    let selected = accounts.filter((a) =>
      staff ? a.role !== 'CLIENT' : a.role === 'CLIENT',
    );
    if (upper.includes("STATUS = 'ACTIVE'"))
      selected = selected.filter((a) => a.active);
    const id =
      value(binds, 'id') ??
      value(binds, 'actorId') ??
      value(binds, 'employeeId');
    if (id !== undefined) selected = selected.filter((a) => a.id === id);
    if (binds.email !== undefined)
      selected = selected.filter((a) => a.email === value(binds, 'email'));
    if (upper.includes("ROLE = 'ADMINISTRATOR'"))
      selected = selected.filter((a) => a.role === 'ADMINISTRATOR');
    if (upper.startsWith('UPDATE')) {
      for (const account of selected) {
        if (upper.includes("STATUS = 'INACTIVE'")) account.active = false;
        if (binds.role !== undefined)
          account.role = value(binds, 'role') as Account['role'];
      }
      return Promise.resolve({ rowsAffected: selected.length });
    }
    if (upper.includes('COUNT(*)'))
      return Promise.resolve({ rows: [{ TOTAL: selected.length }] });
    return Promise.resolve({
      rows: selected.map((a) => ({
        ID: a.id,
        EMPLOYEE_ID: a.id,
        ROLE: a.role,
        EMAIL: a.email,
        FIRST_NAME: 'Ana',
        FIRST_SURNAME: 'Rojas',
        SECOND_NAME: null,
        SECOND_SURNAME: null,
        NAME: 'Ana Rojas',
        PHONE_NUMBER: null,
        CREATED_AT: null,
        ADDRESS_ID: null,
        BRANCH_ID: 1,
        BRANCH_NAME: 'Centro',
        HIRE_DATE: null,
        CREDENTIALS_EMPLOYEE_ID: a.id,
        PASSWORD_HASH: 'retained-password-hash',
        id: a.id,
        email: a.email,
        firstName: 'Ana',
        status: a.active ? 'ACTIVE' : 'INACTIVE',
      })),
    });
  });
  const database = {
    query: execute,
    transaction: async (work: (connection: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(accounts);
      try {
        return await work({ execute });
      } catch (error) {
        accounts = snapshot;
        throw error;
      }
    },
  };
  const cookie = (id = 21, type = 'employee') =>
    EMPLOYEE_SESSION_COOKIE + '=' + jwt.sign({ sub: id, type });
  const patch = (section = 'clients', id = 99, actorId = 21) =>
    request(app.getHttpServer())
      .patch('/api/users/' + section + '/' + id + '/deactivate')
      .set('Origin', origin)
      .set('Cookie', cookie(actorId));
  const get = (path: string, id = 21, type = 'employee') => {
    const call = request(app.getHttpServer()).get('/api/' + path);
    return type === 'client'
      ? call.set('Authorization', 'Bearer ' + jwt.sign({ sub: id, type }))
      : call.set('Cookie', cookie(id, type));
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
      controllers: [UsersUpdateController, UsersListController],
      providers: [
        UsersService,
        UsersRepository,
        ClientsRepository,
        { provide: PasswordGenerator, useValue: { generate: jest.fn() } },
        {
          provide: PasswordHasher,
          useValue: {
            hash: jest.fn(),
            verify: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: InitialCredentialsSender, useValue: { send: jest.fn() } },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ NODE_ENV: 'test', FRONTEND_URL: origin })[key],
        getOrThrow: () => 'deactivation-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(PasswordHasher)
      .useValue({ hash: jest.fn(), verify: jest.fn().mockResolvedValue(true) })
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
    execute.mockClear();
    statements.length = 0;
    accounts = [
      {
        id: 21,
        role: 'ADMINISTRATOR',
        active: true,
        email: 'admin@example.com',
      },
      {
        id: 22,
        role: 'ADMINISTRATOR',
        active: true,
        email: 'other@example.com',
      },
      { id: 42, role: 'EMPLOYEE', active: true, email: 'staff@example.com' },
      { id: 99, role: 'CLIENT', active: true, email: 'client@example.com' },
    ];
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each([21, 42])(
    'allows staff member %s to deactivate a client and immediately hides it',
    async (actor) => {
      await get('users/clients')
        .expect(200)
        .expect((res) => expect(res.body.total).toBe(1));
      await patch('clients', 99, actor).send({}).expect(204);
      expect(accounts.find((a) => a.id === 99)).toMatchObject({
        active: false,
        email: 'client@example.com',
      });
      await get('users/clients')
        .expect(200)
        .expect((res) =>
          expect(res.body).toMatchObject({ total: 0, items: [] }),
        );
      await get('users/clients/99').expect(404);
      await request(app.getHttpServer())
        .patch('/api/users/clients/99')
        .set('Origin', origin)
        .set('Cookie', cookie())
        .send({ firstName: 'Alicia' })
        .expect(404);
      await patch().send({}).expect(404);
      expect(
        statements.some((sql) => /DELETE|UPDATE.*CREDENTIALS/i.test(sql)),
      ).toBe(false);
    },
  );
  it('revokes a client token that was valid before deactivation', async () => {
    await get('auth/me', 99, 'client').expect(200);
    await patch().send({}).expect(204);
    await get('auth/me', 99, 'client').expect(401);
  });
  it('revokes an employee session and blocks future login while preserving the account', async () => {
    await get('auth/me', 42).expect(200);
    await patch('employees', 42).send({}).expect(204);
    await get('auth/me', 42).expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .send({ email: 'staff@example.com', password: 'Abcdef1!' })
      .expect(401);
    await get('users/employees/42').expect(404);
    await get('users/employees')
      .expect(200)
      .expect((res) => expect(res.body.total).toBe(2));
    expect(accounts.find((a) => a.id === 42)).toMatchObject({
      active: false,
      email: 'staff@example.com',
      role: 'EMPLOYEE',
    });
  });
  it('does not grant an employee staff-deactivation permission', async () => {
    await patch('employees', 22, 42).send({}).expect(403);
    expect(accounts.every((a) => a.active)).toBe(true);
  });
  it('protects the current administrator even with another active administrator', async () => {
    await patch('employees', 21).send({}).expect(409);
    expect(accounts.find((a) => a.id === 21)?.active).toBe(true);
  });
  it('allows another administrator to be deactivated and protects the last active administrator from demotion', async () => {
    await patch('employees', 22).send({}).expect(204);
    await request(app.getHttpServer())
      .patch('/api/users/employees/21')
      .set('Origin', origin)
      .set('Cookie', cookie())
      .send({ role: 'EMPLOYEE' })
      .expect(409);
    expect(accounts.find((a) => a.id === 21)).toMatchObject({
      active: true,
      role: 'ADMINISTRATOR',
    });
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid selected ID %s',
    async (id) => {
      await patch('clients', id).send({}).expect(400);
    },
  );
  it.each([{ status: 'ACTIVE' }, { actorId: 22 }, { password: 'changed' }])(
    'rejects client-supplied deactivation fields %p',
    async (body) => {
      await patch().send(body).expect(400);
      expect(accounts.every((a) => a.active)).toBe(true);
    },
  );
  it('rejects absent sessions and foreign origins before updating users', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/clients/99/deactivate')
      .send({})
      .expect(401);
    await patch().set('Origin', 'https://foreign.example').send({}).expect(403);
    expect(accounts.every((a) => a.active)).toBe(true);
  });
  it('returns a sanitized failure and preserves the selected user when persistence fails', async () => {
    execute.mockImplementationOnce(execute.getMockImplementation()!);
    execute.mockRejectedValueOnce(new Error('private Oracle failure'));
    const response = await patch().send({}).expect(500);
    expect(JSON.stringify(response.body)).not.toContain('private Oracle');
    expect(accounts.find((a) => a.id === 99)?.active).toBe(true);
  });
});
