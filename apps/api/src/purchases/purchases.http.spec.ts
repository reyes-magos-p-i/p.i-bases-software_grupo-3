import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Server } from 'node:http';
import { PurchasesModule } from './purchases.module';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchasesRepository } from './purchases.repository';
import { DatabaseService } from '../database/database.service';
import { ClientsService } from '../clients/clients.service';
import { UsersRepository } from '../users/users.repository';
import { PasswordRecoveryRepository } from '../auth/password-recovery.repository';
import { PasswordRecoverySender } from '../auth/notifications/password-recovery-sender';
import { EmailVerificationSender } from '../auth/notifications/email-verification-sender';
describe('Purchase HTTP with mocked persistence', () => {
  let app: INestApplication, server: Server, jwt: JwtService;
  const origin = 'https://cinema.example',
    secret = randomUUID();
  const clients = {
      findById: jest.fn(),
      findPasswordStatus: jest.fn(),
      isEmailVerificationPending: jest.fn(),
    },
    users = {
      findEmployeeIdentityById: jest.fn(),
      findEmployeeCredentialsStatus: jest.fn(),
    },
    recovery = { sessionRevoked: jest.fn() };
  const catalog = {
      getMovie: jest.fn(),
      getFunctions: jest.fn(),
      getFunction: jest.fn(),
      getSeats: jest.fn(),
    },
    storage = { confirm: jest.fn(), list: jest.fn(), findOne: jest.fn() };
  const context = {
    id: 4,
    available: true,
    format: '2D',
    technology: 'STANDARD',
    isPremiere: false,
  };
  const body = {
    functionId: 4,
    seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
  };
  const token = (type = 'client') =>
    jwt.sign({ sub: 8, type, sessionVersion: null });
  const post = (path: string, data: object) =>
    request(server)
      .post('/api/purchases' + path)
      .set('Origin', origin)
      .auth(token(), { type: 'bearer' })
      .send(data);
  beforeEach(async () => {
    jest.resetAllMocks();
    clients.findById.mockResolvedValue({
      id: 8,
      email: 'client@example.com',
      firstName: 'Ana',
    });
    clients.findPasswordStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 90,
    });
    clients.isEmailVerificationPending.mockResolvedValue(false);
    users.findEmployeeIdentityById.mockResolvedValue({
      id: 8,
      role: 'ADMINISTRATOR',
    });
    users.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 90,
    });
    recovery.sessionRevoked.mockResolvedValue(false);
    catalog.getMovie.mockResolvedValue({ id: 2 });
    catalog.getFunctions.mockResolvedValue([context]);
    catalog.getFunction.mockResolvedValue(context);
    catalog.getSeats.mockResolvedValue({
      function: context,
      seats: [{ positionId: 1, state: 'free', type: 'normal' }],
    });
    storage.confirm.mockResolvedValue({ id: 12 });
    storage.list.mockResolvedValue({ items: [] });
    storage.findOne.mockResolvedValue({ id: 12 });
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PurchasesModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ FRONTEND_URL: origin, NODE_ENV: 'test' })[key],
        getOrThrow: () => secret,
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(ClientsService)
      .useValue(clients)
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(PasswordRecoveryRepository)
      .useValue(recovery)
      .overrideProvider(PasswordRecoverySender)
      .useValue({})
      .overrideProvider(EmailVerificationSender)
      .useValue({})
      .overrideProvider(PurchaseCatalogRepository)
      .useValue(catalog)
      .overrideProvider(PurchasesRepository)
      .useValue(storage)
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
    server = app.getHttpServer() as Server;
  });
  afterEach(async () => {
    await app?.close();
  });
  it('loads functions, physical seats and an authoritative quote', async () => {
    const functions = await request(server)
      .get('/api/purchases/movies/2/functions')
      .auth(token(), { type: 'bearer' });
    expect(functions.status).toBe(200);
    expect(functions.body.movie).toEqual({ id: 2 });
    expect(functions.headers['cache-control']).toBe('no-store');
    const seats = await request(server)
      .get('/api/purchases/functions/4/seats')
      .auth(token(), { type: 'bearer' });
    expect(seats.status).toBe(200);
    expect(seats.body.seats).toHaveLength(1);
    const quote = await post('/quote', body);
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({
      quantity: 1,
      total: 3000,
      version: expect.any(String),
    });
  });
  it('binds purchases and history exclusively to the authenticated client', async () => {
    const confirmed = await post('', {
      ...body,
      requestKey: randomUUID(),
      quoteVersion: 'a'.repeat(64),
    });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toEqual({ id: 12 });
    expect(storage.confirm).toHaveBeenCalledWith(
      8,
      expect.objectContaining(body),
    );
    const list = await request(server)
      .get(
        '/api/purchases/me?page=2&search=0122&dateFrom=2026-10-05&dateTo=2026-10-10',
      )
      .auth(token(), { type: 'bearer' });
    expect(list.status).toBe(200);
    expect(storage.list).toHaveBeenCalledWith(8, {
      page: 2,
      search: '0122',
      dateFrom: '2026-10-05',
      dateTo: '2026-10-10',
    });
    const detail = await request(server)
      .get('/api/purchases/me/12')
      .auth(token(), { type: 'bearer' });
    expect(detail.status).toBe(200);
    expect(storage.findOne).toHaveBeenCalledWith(12, 8);
  });
  it('rejects guests, staff, revoked sessions and inactive clients', async () => {
    expect((await request(server).get('/api/purchases/me')).status).toBe(401);
    expect(
      (
        await request(server)
          .get('/api/purchases/me')
          .auth(token('employee'), { type: 'bearer' })
      ).status,
    ).toBe(403);
    recovery.sessionRevoked.mockResolvedValue(true);
    expect((await post('/quote', body)).status).toBe(401);
    recovery.sessionRevoked.mockResolvedValue(false);
    clients.findById.mockResolvedValue(null);
    expect((await post('/quote', body)).status).toBe(401);
    expect(storage.confirm).not.toHaveBeenCalled();
  });
  it('requires an allowed origin and a non-expired password', async () => {
    const originDenied = await request(server)
      .post('/api/purchases/quote')
      .set('Origin', 'https://other.example')
      .auth(token(), { type: 'bearer' })
      .send(body);
    expect(originDenied.status).toBe(403);
    clients.findPasswordStatus.mockResolvedValue({
      setAt: new Date('2000-01-01'),
      expirationDays: 90,
    });
    const expired = await post('/quote', body);
    expect(expired.status).toBe(403);
    expect(expired.body.code).toBe('PASSWORD_EXPIRED');
    expect(storage.confirm).not.toHaveBeenCalled();
  });
  it('rejects injected prices, owners, invalid keys, IDs and duplicate seats', async () => {
    for (const data of [
      { ...body, total: 1 },
      { ...body, clientId: 99 },
      { ...body, seats: { GENERAL: [1, 1], CHILD: [], SENIOR: [] } },
      { ...body, requestKey: 'bad', quoteVersion: 'bad' },
    ]) {
      const response = await post('', data);
      expect(response.status).toBe(400);
      expect(response.body.message).toBeInstanceOf(Array);
    }
    expect(
      (
        await request(server)
          .get('/api/purchases/me?page=0')
          .auth(token(), { type: 'bearer' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(server)
          .get('/api/purchases/functions/1e2/seats')
          .auth(token(), { type: 'bearer' })
      ).status,
    ).toBe(400);
    expect(storage.confirm).not.toHaveBeenCalled();
  });
  it('reports unavailable functions and rate-limits purchase writes', async () => {
    catalog.getFunction.mockResolvedValue({ ...context, available: false });
    const unavailable = await post('/quote', body);
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.code).toBe('FUNCTION_UNAVAILABLE');
    let lastStatus = 0;
    for (let i = 0; i < 11; i++)
      lastStatus = (
        await post('', {
          ...body,
          requestKey: randomUUID(),
          quoteVersion: 'a'.repeat(64),
        })
      ).status;
    expect(lastStatus).toBe(429);
    expect(storage.confirm).toHaveBeenCalledTimes(10);
  });
});
