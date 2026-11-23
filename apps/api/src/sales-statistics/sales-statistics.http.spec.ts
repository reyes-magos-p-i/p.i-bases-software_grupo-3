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
import { SalesStatisticsModule } from './sales-statistics.module';
import { SalesStatisticsRepository } from './sales-statistics.repository';

const secret = randomUUID();
const path = '/api/sales-statistics?dateFrom=2026-11-01&dateTo=2026-11-21';
describe('Sales statistics HTTP access and validation', () => {
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
  const repository = { read: jest.fn() };
  const get = (url = path) =>
    request(app.getHttpServer())
      .get(url)
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
      );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
        SalesStatisticsModule,
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
      .overrideProvider(SalesStatisticsRepository)
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
    repository.read.mockResolvedValue([]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('lets an administrator read aggregate statistics for the selected period', async () => {
    const response = await get().expect(200);
    expect(repository.read).toHaveBeenCalledWith(
      { dateFrom: '2026-11-01', dateTo: '2026-11-21' },
      'day',
    );
    expect(response.body.summary).toEqual({
      revenue: 0,
      tickets: 0,
      purchases: 0,
      averagePurchase: 0,
    });
    expect(response.body.period).toMatchObject({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-21',
    });
  });
  it('accepts a custom age range including newborns', async () => {
    const response = await get(path + '&minAge=0&maxAge=17').expect(200);
    expect(response.body.ageFilter).toEqual({ min: 0, max: 17 });
    expect(repository.read).toHaveBeenCalledWith(
      expect.objectContaining({ minAge: 0, maxAge: 17 }),
      'day',
    );
  });
  it.each([
    '/api/sales-statistics',
    '/api/sales-statistics?dateFrom=2026-11-01',
    '/api/sales-statistics?dateFrom=2026-02-30&dateTo=2026-11-21',
    '/api/sales-statistics?dateFrom=2026-11-21&dateTo=2026-11-01',
    path + '&minAge=20',
    path + '&minAge=50&maxAge=20',
    path + '&minAge=-1&maxAge=20',
    path + '&minAge=1.5&maxAge=20',
    path + '&clientId=7',
    path + '&status=CANCELLED',
  ])('rejects invalid or unsupported filters: %s', async (url) => {
    const response = await get(url).expect(400);
    expect(response.body.message).toBeDefined();
    expect(repository.read).not.toHaveBeenCalled();
  });
  it('rejects visitors without returning data', async () => {
    const response = await request(app.getHttpServer()).get(path).expect(401);
    expect(response.body).not.toHaveProperty('summary');
    expect(repository.read).not.toHaveBeenCalled();
  });
  it('rejects employees even with a valid session', async () => {
    users.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'EMPLOYEE',
    });
    const response = await get().expect(403);
    expect(response.body).not.toHaveProperty('summary');
    expect(repository.read).not.toHaveBeenCalled();
  });
  it('rejects client tokens without exposing any sales', async () => {
    clients.findById.mockResolvedValue({ id: 7, email: 'client@example.com' });
    clients.isEmailVerificationPending.mockResolvedValue(false);
    clients.findPasswordStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 30,
    });
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${jwt.sign({ sub: 7, type: 'client' })}`)
      .expect(403);
    expect(response.body).not.toHaveProperty('summary');
    expect(repository.read).not.toHaveBeenCalled();
  });
  it('preserves the existing expired-password protection', async () => {
    users.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date(Date.now() - 31 * 86400000),
      expirationDays: 30,
    });
    const response = await get().expect(403);
    expect(response.body.code).toBe('PASSWORD_EXPIRED');
    expect(repository.read).not.toHaveBeenCalled();
  });
  it('returns an error without database details or successful stale data', async () => {
    repository.read.mockRejectedValue(new Error('Private database details'));
    const response = await get().expect(500);
    expect(response.body).not.toHaveProperty('summary');
    expect(JSON.stringify(response.body)).not.toContain(
      'Private database details',
    );
  });
});
