import { ClientPreferencesRepository } from './preferences/client-preferences.repository';
import { MoviesRepository } from '../../movies/movies.repository';
import { MovieFunctionsRepository } from '../../movie-fuctions/movie-functions.repository/movie-functions.repository';
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { Server } from 'node:http';
import { ClientProfileModule } from './client-profile.module';
import { ClientsRepository } from '../clients.repository';
import { ClientsService } from '../clients.service';
import { UsersRepository } from '../../users/users.repository';
import { DatabaseService } from '../../database/database.service';
import { PasswordRecoveryRepository } from '../../auth/password-recovery.repository';
import { PasswordRecoverySender } from '../../auth/notifications/password-recovery-sender';
import { EmailVerificationSender } from '../../auth/notifications/email-verification-sender';

describe('Client profile HTTP with mocked persistence and mail', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let server: Server;
  const clients = {
    findClientDetailById: jest.fn(),
    updateClient: jest.fn(),
    deactivateClient: jest.fn(),
    getEmailChangeSnapshot: jest.fn(),
    isClientEmailTaken: jest.fn(),
    confirmEmailChange: jest.fn(),
  };
  const identity = {
    id: 7,
    email: 'old@example.com',
    firstName: 'Ana',
    lastName: 'Rojas',
  };
  const auth = {
    findById: jest.fn(),
    findPasswordStatus: jest.fn(),
    isEmailVerificationPending: jest.fn(),
  };
  const users = {
    getAddressOptions: jest.fn(),
    findEmployeeIdentityById: jest.fn(),
    findEmployeeCredentialsStatus: jest.fn(),
  };
  const recovery = { sessionRevoked: jest.fn() };
  const sender = { send: jest.fn() };
  const preferences = { getPreferences: jest.fn(), savePreferences: jest.fn() };
  const movies = { findGenres: jest.fn(), findLanguages: jest.fn() };
  const catalog = {
    getCatalogCandidates: jest.fn(),
    getMovieFunctions: jest.fn(),
  };
  let savedPreferences: { genreIds: number[]; languageIds: number[] };
  const origin = 'https://cinema.example';
  const token = (type = 'client') =>
    jwt.sign({ sub: 7, type, sessionVersion: null });

  beforeEach(async () => {
    jest.resetAllMocks();
    savedPreferences = { genreIds: [2], languageIds: [3] };
    preferences.getPreferences.mockImplementation(() =>
      Promise.resolve(savedPreferences),
    );
    preferences.savePreferences.mockImplementation(
      (_id: number, data: { genreIds: number[]; languageIds: number[] }) => {
        savedPreferences = data;
        return Promise.resolve(data);
      },
    );
    movies.findGenres.mockResolvedValue([{ id: 2, name: 'Acción' }]);
    movies.findLanguages.mockResolvedValue([{ id: 3, name: 'Español' }]);
    catalog.getCatalogCandidates.mockResolvedValue(
      Array.from({ length: 6 }, (_item, index) => ({
        id: index + 1,
        title: `Película ${index + 1}`,
        posterImage: 'poster.jpg',
        genreIds: index === 5 ? [2] : [],
        languageIds: index === 5 ? [3] : [],
      })),
    );

    auth.findById.mockResolvedValue(identity);
    auth.findPasswordStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 90,
    });
    auth.isEmailVerificationPending.mockResolvedValue(false);
    clients.findClientDetailById.mockResolvedValue({
      ...identity,
      status: 'ACTIVE',
      role: 'CLIENT',
      gender: null,
      address: null,
    });
    clients.getEmailChangeSnapshot.mockResolvedValue({
      email: identity.email,
      sessionVersion: null,
    });
    clients.isClientEmailTaken.mockResolvedValue(false);
    users.getAddressOptions.mockResolvedValue({
      provinces: [],
      cantons: [],
      districts: [],
    });
    users.findEmployeeIdentityById.mockResolvedValue({
      ...identity,
      role: 'ADMINISTRATOR',
    });
    users.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 90,
    });
    recovery.sessionRevoked.mockResolvedValue(false);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ClientProfileModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: (key: string) =>
          key === 'FRONTEND_URL' ? origin : 'profile-http-secret',
        get: (key: string) => ({ FRONTEND_URL: origin, NODE_ENV: 'test' })[key],
      })
      .overrideProvider(DatabaseService)
      .useValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        transaction: jest.fn(),
      })
      .overrideProvider(ClientPreferencesRepository)
      .useValue(preferences)
      .overrideProvider(MoviesRepository)
      .useValue(movies)
      .overrideProvider(MovieFunctionsRepository)
      .useValue(catalog)
      .overrideProvider(ClientsRepository)
      .useValue(clients)
      .overrideProvider(ClientsService)
      .useValue(auth)
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(PasswordRecoveryRepository)
      .useValue(recovery)
      .overrideProvider(PasswordRecoverySender)
      .useValue({ send: jest.fn() })
      .overrideProvider(EmailVerificationSender)
      .useValue(sender)
      .compile();
    app = module.createNestApplication();
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
    jwt = module.get(JwtService);
  });
  afterEach(async () => {
    await app.close();
  });

  it('shows only the authenticated client and returns non-cacheable data', async () => {
    const response = await request(server)
      .get('/api/clients/me')
      .auth(token(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 7, email: identity.email });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(clients.findClientDetailById).toHaveBeenCalledWith(7);
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|hash|credential/iu,
    );
  });
  it('returns address options using the existing catalogs', async () => {
    const response = await request(server)
      .get('/api/clients/me/address-options')
      .auth(token(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      provinces: [],
      cantons: [],
      districts: [],
    });
  });
  it.each(['missing', 'expired', 'revoked', 'inactive'])(
    'rejects %s sessions',
    async (kind) => {
      let bearer = token();
      if (kind === 'expired')
        bearer = jwt.sign({ sub: 7, type: 'client' }, { expiresIn: -1 });
      if (kind === 'revoked') recovery.sessionRevoked.mockResolvedValue(true);
      if (kind === 'inactive') auth.findById.mockResolvedValue(null);
      const response = await request(server)
        .get('/api/clients/me')
        .set('Authorization', kind === 'missing' ? '' : `Bearer ${bearer}`);
      expect(response.status).toBe(401);
      expect(clients.findClientDetailById).not.toHaveBeenCalled();
    },
  );
  it('does not allow employees to use client profile endpoints', async () => {
    const response = await request(server)
      .get('/api/clients/me')
      .auth(token('employee'), { type: 'bearer' });
    expect(response.status).toBe(403);
    expect(clients.findClientDetailById).not.toHaveBeenCalled();
  });
  it.each([null, { setAt: new Date(0), expirationDays: 90 }])(
    'preserves mandatory password setup and expiry %p',
    async (status) => {
      auth.findPasswordStatus.mockResolvedValue(status);
      const response = await request(server)
        .get('/api/clients/me')
        .auth(token(), { type: 'bearer' });
      expect(response.status).toBe(403);
      expect(clients.findClientDetailById).not.toHaveBeenCalled();
    },
  );
  it('updates editable fields on the session account', async () => {
    const response = await request(server)
      .patch('/api/clients/me')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send({ firstName: ' María ', gender: 'F' });
    expect(response.status).toBe(204);
    expect(clients.updateClient).toHaveBeenCalledWith(7, {
      firstName: 'María',
      gender: 'F',
    });
  });
  it.each([
    { clientId: 8, firstName: 'Ana' },
    { firstName: 'Ana1' },
    { phoneNumber: '22223333' },
    { email: 'hijack@example.com' },
    {},
  ])('rejects unsafe or empty updates %p', async (input) => {
    const response = await request(server)
      .patch('/api/clients/me')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send(input);
    expect(response.status).toBe(400);
    expect(clients.updateClient).not.toHaveBeenCalled();
  });
  it('rejects untrusted origins before writing', async () => {
    const response = await request(server)
      .patch('/api/clients/me')
      .auth(token(), { type: 'bearer' })
      .set('Origin', 'https://other.example')
      .send({ firstName: 'Ana' });
    expect(response.status).toBe(403);
    expect(clients.updateClient).not.toHaveBeenCalled();
  });
  it('deactivates only the session account', async () => {
    const response = await request(server)
      .patch('/api/clients/me/deactivate')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send({});
    expect(response.status).toBe(204);
    expect(clients.deactivateClient).toHaveBeenCalledWith(7);
  });

  it('rejects attempts to select another client in paths or lifecycle payloads', async () => {
    const selected = await request(server)
      .get('/api/clients/me/8')
      .auth(token(), { type: 'bearer' });
    expect(selected.status).toBe(404);
    const response = await request(server)
      .patch('/api/clients/me/deactivate')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send({ clientId: 8 });
    expect(response.status).toBe(400);
    expect(clients.deactivateClient).not.toHaveBeenCalled();
  });
  it('requests verification without updating email', async () => {
    const response = await request(server)
      .post('/api/clients/me/email-change')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send({ email: ' New@Example.com ' });
    expect(response.status).toBe(202);
    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.com',
        purpose: 'email-change',
      }),
    );
    expect(clients.confirmEmailChange).not.toHaveBeenCalled();
  });
  it('confirms explicitly without a login session and rejects use as an access token', async () => {
    const confirmation = jwt.sign(
      {
        sub: 7,
        purpose: 'client-email-change',
        email: identity.email,
        newEmail: 'new@example.com',
        sessionVersion: null,
      },
      { audience: 'client-email-change', expiresIn: 1800 },
    );
    const get = await request(server).get('/api/clients/email-change/confirm');
    expect(get.status).toBe(404);
    expect(clients.confirmEmailChange).not.toHaveBeenCalled();
    const login = await request(server)
      .get('/api/clients/me')
      .auth(confirmation, { type: 'bearer' });
    expect(login.status).toBe(401);
    const response = await request(server)
      .post('/api/clients/email-change/confirm')
      .set('Origin', origin)
      .send({ token: confirmation });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ clientId: 7 });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(clients.confirmEmailChange).toHaveBeenCalledWith(
      7,
      identity.email,
      'new@example.com',
      null,
    );
  });
  it('limits repeated email requests', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await request(server)
        .post('/api/clients/me/email-change')
        .auth(token(), { type: 'bearer' })
        .set('Origin', origin)
        .send({ email: 'new@example.com' });
      expect(response.status).toBe(202);
    }
    const response = await request(server)
      .post('/api/clients/me/email-change')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send({ email: 'new@example.com' });
    expect(response.status).toBe(429);
    expect(sender.send).toHaveBeenCalledTimes(5);
  });
  it('loads current preference catalogs and selections without caching personal data', async () => {
    const response = await request(server)
      .get('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      genres: [{ id: 2, name: 'Acción' }],
      languages: [{ id: 3, name: 'Español' }],
      selected: { genreIds: [2], languageIds: [3] },
      maxSelections: 1000,
    });
    expect(preferences.getPreferences).toHaveBeenCalledWith(7);
    movies.findGenres.mockResolvedValue([
      { id: 2, name: 'Nombre nuevo' },
      { id: 4, name: 'Drama' },
    ]);
    const updated = await request(server)
      .get('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' });
    expect(updated.status).toBe(200);
    expect(updated.body.genres).toHaveLength(2);
    expect(updated.body.genres[0].name).toBe('Nombre nuevo');
  });
  it('stores and clears selections for the session account across new tokens', async () => {
    const selected = { genreIds: [2, 4], languageIds: [3] };
    const saved = await request(server)
      .put('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send(selected);
    expect(saved.status).toBe(200);
    expect(preferences.savePreferences).toHaveBeenCalledWith(7, selected);
    const reloaded = await request(server)
      .get('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' });
    expect(reloaded.body.selected).toEqual(selected);
    const cleared = await request(server)
      .put('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send({ genreIds: [], languageIds: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ genreIds: [], languageIds: [] });
    const unranked = await request(server)
      .get('/api/clients/me/preferences/portal')
      .auth(token(), { type: 'bearer' });
    expect(unranked.status).toBe(200);
    expect(unranked.body.map((movie: { id: number }) => movie.id)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
  it.each([
    { genreIds: [2, 2], languageIds: [] },
    { genreIds: ['2'], languageIds: [] },
    { genreIds: [], languageIds: null },
    { genreIds: [], languageIds: [], clientId: 8 },
    {},
  ])('rejects malformed preference changes %p', async (input) => {
    const response = await request(server)
      .put('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send(input);
    expect(response.status).toBe(400);
    expect(preferences.savePreferences).not.toHaveBeenCalled();
  });
  it('rejects untrusted preference writes and employee access', async () => {
    const originFailure = await request(server)
      .put('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' })
      .set('Origin', 'https://other.example')
      .send({ genreIds: [], languageIds: [] });
    expect(originFailure.status).toBe(403);
    const employee = await request(server)
      .get('/api/clients/me/preferences')
      .auth(token('employee'), { type: 'bearer' });
    expect(employee.status).toBe(403);
    expect(preferences.savePreferences).not.toHaveBeenCalled();
    expect(preferences.getPreferences).not.toHaveBeenCalled();
  });
  it('keeps the general complete catalog public and prioritizes only the own client portal', async () => {
    const publicCatalog = await request(server).get(
      '/api/movie-fuctions/catalog',
    );
    expect(publicCatalog.status).toBe(200);
    expect(publicCatalog.body.map((movie: { id: number }) => movie.id)).toEqual(
      [1, 2, 3, 4, 5, 6],
    );
    const privateCatalog = await request(server)
      .get('/api/clients/me/preferences/portal')
      .auth(token(), { type: 'bearer' });
    expect(privateCatalog.status).toBe(200);
    expect(
      privateCatalog.body.map((movie: { id: number }) => movie.id),
    ).toEqual([6, 1, 2, 3, 4, 5]);
    expect(privateCatalog.headers['cache-control']).toBe('no-store');
    expect(Object.keys(privateCatalog.body[0]).sort()).toEqual([
      'id',
      'posterImage',
      'title',
    ]);
    expect(preferences.getPreferences).toHaveBeenCalledWith(7);
  });
  it.each([
    '/api/clients/me/preferences',
    '/api/clients/me/preferences/portal',
  ])('requires a valid client session for %s', async (path) => {
    const response = await request(server).get(path);
    expect(response.status).toBe(401);
    expect(preferences.getPreferences).not.toHaveBeenCalled();
  });
  it('reports options removed from the catalog without pretending preferences were saved', async () => {
    preferences.savePreferences.mockRejectedValue(
      new BadRequestException('Una de las opciones ya no está disponible.'),
    );
    const response = await request(server)
      .put('/api/clients/me/preferences')
      .auth(token(), { type: 'bearer' })
      .set('Origin', origin)
      .send({ genreIds: [99], languageIds: [] });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('ya no está disponible');
  });
  it.each(['expired', 'revoked', 'inactive'])(
    'rejects %s sessions before reading personal preference data',
    async (kind) => {
      let bearer = token();
      if (kind === 'expired')
        bearer = jwt.sign({ sub: 7, type: 'client' }, { expiresIn: -1 });
      if (kind === 'revoked') recovery.sessionRevoked.mockResolvedValue(true);
      if (kind === 'inactive') auth.findById.mockResolvedValue(null);
      const response = await request(server)
        .get('/api/clients/me/preferences/portal')
        .auth(bearer, { type: 'bearer' });
      expect(response.status).toBe(401);
      expect(preferences.getPreferences).not.toHaveBeenCalled();
    },
  );
  it('returns the same complete ordered catalog for guests and clients without preferences', async () => {
    const guest = await request(server).get('/api/movie-fuctions/catalog');
    expect(guest.status).toBe(200);
    expect(guest.headers['cache-control']).toBe('no-store');
    expect(guest.body).toHaveLength(6);
    expect(preferences.getPreferences).not.toHaveBeenCalled();
    expect(auth.findById).not.toHaveBeenCalled();
    savedPreferences = { genreIds: [], languageIds: [] };
    const client = await request(server)
      .get('/api/clients/me/preferences/portal')
      .auth(token(), { type: 'bearer' });
    expect(client.status).toBe(200);
    expect(client.body).toEqual(guest.body);
    expect(guest.body.map((movie: { id: number }) => movie.id)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });
});
