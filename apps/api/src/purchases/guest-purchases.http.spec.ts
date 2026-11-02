import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { SessionOriginGuard } from '../auth/guards/session-origin.guard';
import { EmployeeSessionService } from '../auth/employee-session.service';
import { ClientsService } from '../clients/clients.service';
import { GuestPurchasesController } from './guest-purchases.controller';
import { GuestPurchasesService } from './guest-purchases.service';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './purchases.repository';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchaseThrottlerGuard } from './purchase-throttler.guard';
import { guestPurchaseCode } from './guest-purchase-access';

describe('Guest purchase HTTP with mocked persistence', () => {
  let app: INestApplication, server: Server;
  const origin = 'https://cinema.example';
  const clients = { findByEmail: jest.fn() },
    repository = { confirmGuest: jest.fn(), findGuest: jest.fn() };
  const catalog = {
    getMovie: jest.fn(),
    getFunctions: jest.fn(),
    getFunction: jest.fn(),
    getSeats: jest.fn(),
  };
  const selection = {
    functionId: 4,
    seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
  };
  const buyer = {
    email: 'guest@example.com',
    confirmEmail: 'guest@example.com',
  };
  const body = () => ({
    ...selection,
    buyer,
    requestKey: randomUUID(),
    quoteVersion: 'a'.repeat(64),
  });
  const post = (path: string, data: object) =>
    request(server)
      .post('/api/guest-purchases' + path)
      .set('Origin', origin)
      .send(data);
  beforeEach(async () => {
    jest.resetAllMocks();
    const context = {
      id: 4,
      available: true,
      format: '2D',
      technology: 'STANDARD',
      isPremiere: false,
    };
    catalog.getMovie.mockResolvedValue({ id: 2 });
    catalog.getFunctions.mockResolvedValue([context]);
    catalog.getFunction.mockResolvedValue(context);
    catalog.getSeats.mockResolvedValue({
      function: context,
      seats: [{ positionId: 1, state: 'free', type: 'normal' }],
    });
    repository.confirmGuest.mockResolvedValue({
      id: 12,
      accessCode: 'private',
    });
    repository.findGuest.mockResolvedValue({ id: 12, tickets: [{ id: 8 }] });
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])],
      controllers: [GuestPurchasesController],
      providers: [
        GuestPurchasesService,
        PurchasesService,
        SessionOriginGuard,
        PurchaseThrottlerGuard,
        {
          provide: EmployeeSessionService,
          useValue: { allowedOrigin: origin },
        },
        { provide: ClientsService, useValue: clients },
        { provide: PurchasesRepository, useValue: repository },
        { provide: PurchaseCatalogRepository, useValue: catalog },
      ],
    }).compile();
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
  it('offers functions, seats and quotes without cookies or a client token', async () => {
    const functions = await request(server).get(
      '/api/guest-purchases/movies/2/functions',
    );
    expect(functions.status).toBe(200);
    expect(functions.body.movie.id).toBe(2);
    const seats = await request(server).get(
      '/api/guest-purchases/functions/4/seats',
    );
    expect(seats.status).toBe(200);
    expect(seats.body.seats).toHaveLength(1);
    const quote = await post('/quote', selection);
    expect(quote.status).toBe(200);
    expect(quote.body.total).toBe(3000);
    expect(quote.headers['cache-control']).toBe('no-store');
    expect(clients.findByEmail).not.toHaveBeenCalled();
  });
  it('normalizes the email, confirms a guest purchase and retrieves it with a private code', async () => {
    const identification = await post('/buyer', {
      email: ' Guest@Example.com ',
      confirmEmail: 'GUEST@example.com',
    });
    expect(identification.status).toBe(200);
    expect(identification.body.email).toBe(buyer.email);
    const data = body();
    const receipt = await post('', data);
    expect(receipt.status).toBe(201);
    expect(receipt.body.accessCode).toBe('private');
    expect(repository.confirmGuest).toHaveBeenCalledWith(
      buyer.email,
      expect.objectContaining(data),
    );
    const code = guestPurchaseCode(12, data.requestKey);
    const lookup = await post('/lookup', { accessCode: code });
    expect(lookup.status).toBe(200);
    expect(lookup.body.tickets).toEqual([{ id: 8 }]);
    expect(repository.findGuest).toHaveBeenCalledWith(code);
    expect(lookup.headers['cache-control']).toBe('no-store');
    expect(receipt.headers['set-cookie']).toBeUndefined();
  });
  it('requires matching emails and prevents continuing with a registered email', async () => {
    const mismatch = await post('', {
      ...body(),
      buyer: { ...buyer, confirmEmail: 'other@example.com' },
    });
    expect(mismatch.status).toBe(400);
    clients.findByEmail.mockResolvedValue({ id: 8 });
    const registered = await post('/buyer', buyer);
    expect(registered.status).toBe(409);
    expect(registered.body.code).toBe('CLIENT_LOGIN_REQUIRED');
    expect(repository.confirmGuest).not.toHaveBeenCalled();
  });
  it.each([
    { buyer: { email: 'bad', confirmEmail: 'bad' } },
    { clientId: 8 },
    { total: 1 },
    { requestKey: 'bad' },
    { seats: { GENERAL: [], CHILD: [], SENIOR: [] }, functionId: 0 },
  ])('rejects invalid or injected confirmation fields: %j', async (invalid) => {
    const result = await post('', { ...body(), ...invalid });
    expect(result.status).toBe(400);
    expect(repository.confirmGuest).not.toHaveBeenCalled();
  });
  it('rejects invalid IDs, origins and lookup codes before persistence', async () => {
    const badId = await request(server).get(
      '/api/guest-purchases/functions/1e2/seats',
    );
    expect(badId.status).toBe(400);
    const originDenied = await request(server)
      .post('/api/guest-purchases')
      .send(body());
    expect(originDenied.status).toBe(403);
    const badCode = await post('/lookup', {
      accessCode: 'ORD-000012',
      email: buyer.email,
    });
    expect(badCode.status).toBe(400);
    expect(repository.findGuest).not.toHaveBeenCalled();
    expect(repository.confirmGuest).not.toHaveBeenCalled();
  });
  it('accepts previous full-length codes without weakening receipt lookup', async () => {
    const legacy = 'INV-12-' + 'a'.repeat(64);
    const result = await post('/lookup', { accessCode: legacy.toLowerCase() });
    expect(result.status).toBe(200);
    expect(repository.findGuest).toHaveBeenCalledWith(legacy.toUpperCase());
  });
  it('does not expose a receipt for an unknown or altered code', async () => {
    repository.findGuest.mockRejectedValue(
      new NotFoundException(
        'No se encontró una compra con ese código de consulta.',
      ),
    );
    const result = await post('/lookup', {
      accessCode: guestPurchaseCode(12, randomUUID()),
    });
    expect(result.status).toBe(404);
    expect(result.body.tickets).toBeUndefined();
  });
  it('rate-limits guest confirmations and receipt lookups', async () => {
    const results = await Promise.all(
      Array.from({ length: 11 }, () => post('', body())),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(10);
    expect(results.filter((result) => result.status === 429)).toHaveLength(1);
    const lookups = await Promise.all(
      Array.from({ length: 11 }, () =>
        post('/lookup', { accessCode: guestPurchaseCode(12, randomUUID()) }),
      ),
    );
    expect(lookups.filter((result) => result.status === 429)).toHaveLength(1);
    expect(repository.findGuest).toHaveBeenCalledTimes(10);
    expect(
      Number(
        lookups.find((result) => result.status === 429)?.headers['retry-after'],
      ),
    ).toBeGreaterThan(0);
  });
});
