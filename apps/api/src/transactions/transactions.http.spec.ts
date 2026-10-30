import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../auth/auth.module';
import { EMPLOYEE_SESSION_COOKIE } from '../auth/employee-session.service';
import { EmailVerificationSender } from '../auth/notifications/email-verification-sender';
import { PasswordRecoverySender } from '../auth/notifications/password-recovery-sender';
import { PasswordRecoveryRepository } from '../auth/password-recovery.repository';
import { ClientsService } from '../clients/clients.service';
import { DatabaseService } from '../database/database.service';
import { UsersRepository } from '../users/users.repository';
import { TransactionsModule } from './transactions.module';
import { TransactionsRepository } from './transactions.repository';

const secret = randomUUID();

describe('Transactions HTTP contracts', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  const users = {
    findEmployeeIdentityById: jest.fn(),
    findEmployeeCredentialsStatus: jest.fn(),
  };
  const clients = {
    findById: jest.fn(),
    isEmailVerificationPending: jest.fn(),
    findPasswordStatus: jest.fn(),
  };
  const repository = {
    listTransactions: jest.fn(),
    listFilterOptions: jest.fn(),
    findTransactionById: jest.fn(),
  };
  const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  const paths = [
    '/transactions',
    '/transactions/filter-options',
    '/transactions/123',
  ];
  const get = (path: string, authenticated = true) => {
    const call = request(app.getHttpServer()).get('/api' + path);
    return authenticated
      ? call.set(
          'Cookie',
          `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
        )
      : call;
  };
  const expectNoData = () => {
    expect(repository.listTransactions).not.toHaveBeenCalled();
    expect(repository.listFilterOptions).not.toHaveBeenCalled();
    expect(repository.findTransactionById).not.toHaveBeenCalled();
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
        TransactionsModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          ({ NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:5173' })[key],
        getOrThrow: () => secret,
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(PasswordRecoverySender)
      .useValue({ send: jest.fn(), notifyChanged: jest.fn() })
      .overrideProvider(PasswordRecoveryRepository)
      .useValue({ sessionRevoked: jest.fn().mockResolvedValue(false) })
      .overrideProvider(EmailVerificationSender)
      .useValue({ send: jest.fn() })
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(ClientsService)
      .useValue(clients)
      .overrideProvider(TransactionsRepository)
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
    users.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'ADMINISTRATOR',
    });
    users.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 30,
    });
    repository.listTransactions.mockResolvedValue(page);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists transactions with the search, filters and page from the query string (UT-043)', async () => {
    await get(
      '/transactions?search=%20FAC-000123%20&branchId=1&movieId=62&status=PAID&dateFrom=2026-10-05&dateTo=2026-10-16&page=2&pageSize=20',
    ).expect(200, page);
    expect(repository.listTransactions).toHaveBeenCalledWith({
      search: 'FAC-000123',
      branchId: 1,
      movieId: 62,
      status: 'PAID',
      dateFrom: '2026-10-05',
      dateTo: '2026-10-16',
      page: 2,
      pageSize: 20,
    });
  });

  it('uses the first page of 10 by default', async () => {
    await get('/transactions').expect(200);
    expect(repository.listTransactions).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
    });
  });

  it('returns the filter options', async () => {
    const options = {
      branches: [{ id: 1, name: 'Cinetadel Multiplaza del Este' }],
      movies: [{ id: 62, title: 'Ecos del Volcán' }],
    };
    repository.listFilterOptions.mockResolvedValue(options);
    await get('/transactions/filter-options').expect(200, options);
  });

  it('returns the detail of a transaction (UT-052)', async () => {
    const detail = { id: 123, status: 'PAID', lines: [] };
    repository.findTransactionById.mockResolvedValue(detail);
    await get('/transactions/123').expect(200, detail);
    expect(repository.findTransactionById).toHaveBeenCalledWith(123);
  });

  it('answers 404 for a transaction that no longer exists (UT-054)', async () => {
    repository.findTransactionById.mockResolvedValue(null);
    const response = await get('/transactions/125').expect(404);
    expect(response.body.message).toBe(
      'No fue posible cargar el detalle de la transacción',
    );
  });

  it.each(['/transactions/0', '/transactions/abc', '/transactions/FAC-000123'])(
    'rejects the invalid ID in %s',
    async (path) => {
      await get(path).expect(400);
      expect(repository.findTransactionById).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/transactions?pageSize=15',
    '/transactions?page=0',
    '/transactions?search=%20%20',
    '/transactions?branchId=abc',
    '/transactions?movieId=0',
    '/transactions?status=PENDING',
    '/transactions?dateFrom=05/10/2026',
    '/transactions?dateTo=2026-02-30',
    '/transactions?dateFrom=2026-10-16&dateTo=2026-10-05',
    '/transactions?clientId=7',
  ])('rejects the invalid request %s', async (path) => {
    await get(path).expect(400);
    expect(repository.listTransactions).not.toHaveBeenCalled();
  });

  it.each(paths)('requires a session for %s (UT-050)', async (path) => {
    await get(path, false).expect(401);
    expectNoData();
  });

  it.each(paths)(
    'answers 403 without data to a regular employee on %s (UT-051)',
    async (path) => {
      users.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role: 'EMPLOYEE',
      });
      const response = await get(path).expect(403);
      expect(response.body).not.toHaveProperty('items');
      expectNoData();
    },
  );

  it.each(paths)('answers 403 without data to a client on %s (UT-056)', async (path) => {
    clients.findById.mockResolvedValue({ id: 7, email: 'a@a.com' });
    clients.isEmailVerificationPending.mockResolvedValue(false);
    clients.findPasswordStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 30,
    });
    const response = await request(app.getHttpServer())
      .get('/api' + path)
      .set('Authorization', `Bearer ${jwt.sign({ sub: 7, type: 'client' })}`)
      .expect(403);
    expect(response.body).not.toHaveProperty('items');
    expectNoData();
  });

  it('blocks an administrator whose password expired', async () => {
    users.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      expirationDays: 30,
    });
    const response = await get('/transactions').expect(403);
    expect(response.body.code).toBe('PASSWORD_EXPIRED');
    expectNoData();
  });
});
