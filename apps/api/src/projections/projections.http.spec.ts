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
import { ClientsService } from '../clients/clients.service';
import { DatabaseService } from '../database/database.service';
import { UsersRepository } from '../users/users.repository';
import { ProjectionsModule } from './projections.module';
import { ProjectionsRepository } from './projections.repository';

const secret = randomUUID();

describe('Projections HTTP contracts', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  const origin = 'http://localhost:5173';
  const users = {
    findEmployeeIdentityById: jest.fn(),
    findEmployeeCredentialsStatus: jest.fn(),
  };
  const repository = {
    getCatalogs: jest.fn(),
    getScheduledMovies: jest.fn(),
    listProjections: jest.fn(),
    findProjection: jest.fn(),
    findAvailableMovies: jest.fn(),
    findAvailableMovieRunningTime: jest.fn(),
    createProjections: jest.fn(),
    updateProjection: jest.fn(),
    cancelProjection: jest.fn(),
  };
  const session = () =>
    `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`;
  const valid = {
    movieId: 3,
    theaterId: 7,
    startDate: '2099-07-21',
    endDate: '2099-07-23',
    startTime: '21:00',
    endTime: '01:55',
    cleaningMinutes: 30,
    advertisementMinutes: 15,
    price: 4500.5,
    status: 'INACTIVE',
  };
  const post = (body: object) =>
    request(app.getHttpServer())
      .post('/api/projections')
      .set('Origin', origin)
      .set('Cookie', session())
      .send(body);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
        ProjectionsModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ NODE_ENV: 'test', FRONTEND_URL: origin })[key],
        getOrThrow: () => secret,
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(EmailVerificationSender)
      .useValue({ send: jest.fn() })
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(ClientsService)
      .useValue({})
      .overrideProvider(ProjectionsRepository)
      .useValue(repository)
      .compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    users.findEmployeeIdentityById.mockResolvedValue({ id: 21, role: 'ADMINISTRATOR' });
    users.findEmployeeCredentialsStatus.mockResolvedValue({ setAt: new Date(), expirationDays: 90 });
    repository.findAvailableMovieRunningTime.mockResolvedValue(190);
    repository.createProjections.mockResolvedValue({
      status: 'INACTIVE',
      price: 4500.5,
      projections: [{ movieFunctionId: 100 }],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates projections for the authenticated administrator', async () => {
    await post(valid).expect(201, {
      status: 'INACTIVE',
      price: 4500.5,
      projections: [{ movieFunctionId: 100 }],
    });
    expect(repository.createProjections).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'INACTIVE', slots: expect.any(Array) }),
      21,
    );
    expect(repository.createProjections.mock.calls[0][0].slots).toHaveLength(3);
  });

  it('returns the scheduling options and the branch movie search', async () => {
    repository.getCatalogs.mockResolvedValue({ cinemas: [], theaters: [] });
    repository.findAvailableMovies.mockResolvedValue([{ movieId: 3 }]);
    await request(app.getHttpServer())
      .get('/api/projections/options')
      .set('Cookie', session())
      .expect(200, { cinemas: [], theaters: [], defaultTicketPrice: 3500 });
    await request(app.getHttpServer())
      .get('/api/projections/available-movies?branchId=2&search=spi')
      .set('Cookie', session())
      .expect(200, [{ movieId: 3 }]);
    expect(repository.findAvailableMovies).toHaveBeenCalledWith(2, 'spi');
    await request(app.getHttpServer())
      .get('/api/projections/available-movies?branchId=abc')
      .set('Cookie', session())
      .expect(400);
  });

  const get = (path: string) =>
    request(app.getHttpServer()).get(`/api/projections${path}`).set('Cookie', session());

  it('lists projections with defaults and combined filters', async () => {
    repository.listProjections.mockResolvedValue({ items: [], total: 0 });
    await get('').expect(200, { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
    expect(repository.listProjections).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 });

    await get(
      '?page=2&pageSize=25&status=CANCELLED&branchId=2&theaterId=7&movieId=3&dateFrom=2099-07-01&dateTo=2099-07-31&timeFrom=18:00&timeTo=22:00&search=spi',
    ).expect(200);
    expect(repository.listProjections).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 25,
      status: 'CANCELLED',
      branchId: 2,
      theaterId: 7,
      movieId: 3,
      dateFrom: '2099-07-01',
      dateTo: '2099-07-31',
      timeFrom: '18:00',
      timeTo: '22:00',
      search: 'spi',
    });
  });

  it.each([
    ['?status=DELETED', 'Selecciona un estado de la lista.'],
    ['?pageSize=7', 'El tamaño de página debe ser 10, 25, 50 o 100.'],
    ['?page=0', 'La página debe ser un número entero positivo.'],
    ['?branchId=x', 'Selecciona una sucursal de la lista.'],
    ['?dateFrom=2099-13-01', 'Introduce una fecha válida (AAAA-MM-DD).'],
    ['?timeTo=25:00', 'Introduce una hora válida (HH:mm).'],
    ['?movieName=spi', 'property movieName should not exist'],
  ])('rejects invalid list filters %s', async (query, message) => {
    const response = await get(query).expect(400);
    expect(response.body.message).toContain(message);
    expect(repository.listProjections).not.toHaveBeenCalled();
  });

  it('returns filter options and the detail of a projection', async () => {
    repository.getCatalogs.mockResolvedValue({ cinemas: [], theaters: [] });
    repository.getScheduledMovies.mockResolvedValue([]);
    await get('/filter-options').expect(200, { cinemas: [], theaters: [], movies: [] });

    repository.findProjection.mockResolvedValueOnce({ movieFunctionId: 100 });
    await get('/100').expect(200, { movieFunctionId: 100 });
    repository.findProjection.mockResolvedValueOnce(null);
    const missing = await get('/101').expect(404);
    expect(missing.body.message).toBe('Esta proyección ya no está disponible.');
    await get('/abc').expect(400);
  });

  it.each([
    [{ price: 0 }, 'El precio debe ser un número positivo en colones.'],
    [{ price: -5 }, 'El precio debe ser un número positivo en colones.'],
    [{ price: '4500' }, 'El precio debe ser un número positivo en colones.'],
    [{ price: 10.123 }, 'El precio debe ser un número positivo en colones.'],
    [{ startDate: '2099-02-30' }, 'Introduce una fecha válida (AAAA-MM-DD).'],
    [{ startTime: '24:00' }, 'Introduce una hora válida (HH:mm).'],
    [{ cleaningMinutes: 241 }, 'Los minutos deben ser un entero entre 0 y 240.'],
    [{ status: 'CANCELLED' }, 'El estado debe ser activa o inactiva.'],
    [{ movieId: 'x' }, 'Selecciona una película.'],
  ])('rejects invalid fields %#', async (override, message) => {
    const response = await post({ ...valid, ...override }).expect(400);
    expect(response.body.message).toContain(message);
    expect(repository.createProjections).not.toHaveBeenCalled();
  });

  it('rejects unknown fields and foreign origins', async () => {
    await post({ ...valid, createdBy: 1 }).expect(400);
    await request(app.getHttpServer())
      .post('/api/projections')
      .set('Origin', 'https://evil.example')
      .set('Cookie', session())
      .send(valid)
      .expect(403);
    expect(repository.createProjections).not.toHaveBeenCalled();
  });

  it('denies non administrators and anonymous requests', async () => {
    users.findEmployeeIdentityById.mockResolvedValue({ id: 21, role: 'EMPLOYEE' });
    await post(valid).expect(403);
    await request(app.getHttpServer()).get('/api/projections/options').expect(401);
    expect(repository.createProjections).not.toHaveBeenCalled();
  });

  it('blocks administrators whose password expired', async () => {
    users.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date('2000-01-01T00:00:00Z'),
      expirationDays: 30,
    });
    const response = await get('').expect(403);
    expect(response.body).toMatchObject({ code: 'PASSWORD_EXPIRED' });
    await post(valid).expect(403);
    expect(repository.listProjections).not.toHaveBeenCalled();
    expect(repository.createProjections).not.toHaveBeenCalled();
  });

  describe('PUT /projections/:id', () => {
    const changes = {
      movieId: 3,
      theaterId: 7,
      startDate: '2099-07-21',
      startTime: '21:00',
      endTime: '01:55',
      cleaningMinutes: 30,
      advertisementMinutes: 15,
      price: 4200,
      status: 'ACTIVE',
    };
    const put = (body: object, path = '/100', origin_ = origin) =>
      request(app.getHttpServer())
        .put(`/api/projections${path}`)
        .set('Origin', origin_)
        .set('Cookie', session())
        .send(body);

    it('updates a projection and returns its detail', async () => {
      repository.findProjection.mockResolvedValue({ movieFunctionId: 100 });
      await put(changes).expect(200, { movieFunctionId: 100 });
      expect(repository.updateProjection).toHaveBeenCalledWith(
        100,
        expect.objectContaining({ price: 4200, status: 'ACTIVE' }),
        21,
      );
    });

    it('rejects ranges, invalid ids and foreign origins', async () => {
      const range = await put({ ...changes, endDate: '2099-07-25' }).expect(400);
      expect(range.body.message).toContain('property endDate should not exist');
      await put(changes, '/abc').expect(400);
      await put({ ...changes, status: 'CANCELLED' }).expect(400);
      await put(changes, '/100', 'https://evil.example').expect(403);
      expect(repository.updateProjection).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /projections/:id/cancel', () => {
    const cancel = (path = '/100', origin_ = origin) =>
      request(app.getHttpServer())
        .patch(`/api/projections${path}/cancel`)
        .set('Origin', origin_)
        .set('Cookie', session());

    it('cancels a projection and returns its detail', async () => {
      repository.findProjection.mockResolvedValue({ movieFunctionId: 100, status: 'CANCELLED' });
      await cancel().expect(200, { movieFunctionId: 100, status: 'CANCELLED' });
      expect(repository.cancelProjection).toHaveBeenCalledWith(100);
    });

    it('rejects invalid ids, foreign origins and non administrators', async () => {
      await cancel('/abc').expect(400);
      await cancel('/100', 'https://evil.example').expect(403);
      users.findEmployeeIdentityById.mockResolvedValue({ id: 21, role: 'EMPLOYEE' });
      await cancel().expect(403);
      expect(repository.cancelProjection).not.toHaveBeenCalled();
    });
  });
});
