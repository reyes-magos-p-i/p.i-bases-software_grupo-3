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
import { CinemasModule } from './cinemas.module';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';

const secret = randomUUID();

describe('Branches HTTP contracts', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  const users = {
    findEmployeeIdentityById: jest.fn(),
    findEmployeeCredentialsStatus: jest.fn(),
  };
  const repository = {
    getAllCinemas: jest.fn(),
    listCinemas: jest.fn(),
    listCompanies: jest.fn(),
    findCinemaById: jest.fn(),
    createCinema: jest.fn(),
    updateCinema: jest.fn(),
  };
  const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
  const get = (path: string, authenticated = true) => {
    const call = request(app.getHttpServer()).get('/api' + path);
    return authenticated
      ? call.set(
          'Cookie',
          `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
        )
      : call;
  };

  const origin = 'http://localhost:5173';
  const send = (
    method: 'post' | 'patch',
    path: string,
    body: object,
    headers: { origin?: string } = {},
  ) => {
    const server = request(app.getHttpServer());
    const call =
      method === 'post'
        ? server.post('/api' + path)
        : server.patch('/api' + path);
    return call
      .set('Origin', headers.origin ?? origin)
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
      )
      .send(body);
  };
  const created = {
    id: 30,
    name: 'Sucursal Heredia Centro',
    companyId: 21,
    companyName: 'Cinetadel S.A',
    status: 'ACTIVE',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
        CinemasModule,
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
      .useValue({})
      .overrideProvider(CinemasRepository)
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
      expirationDays: 90,
    });
    repository.listCinemas.mockResolvedValue(page);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists branches with the search, company and page from the query string', async () => {
    await get(
      '/cinemas/list?search=%20SU-001%20&companyId=2&page=3&pageSize=20',
    ).expect(200, page);
    expect(repository.listCinemas).toHaveBeenCalledWith({
      search: 'SU-001',
      companyId: 2,
      page: 3,
      pageSize: 20,
    });
  });

  it('keeps GET /cinemas as the full branch array used by Salas', async () => {
    const all = [{ branchId: 1, name: 'Centro', companyId: 2 }];
    repository.getAllCinemas.mockResolvedValue(all);
    await get('/cinemas').expect(200, all);
    expect(repository.listCinemas).not.toHaveBeenCalled();
  });

  it('returns the company options and the detail of a branch', async () => {
    const branch = {
      id: 8,
      name: null,
      companyId: 5,
      companyName: null,
      status: 'ACTIVE',
    };
    repository.listCompanies.mockResolvedValue([{ id: 5, name: null }]);
    repository.findCinemaById.mockResolvedValue(branch);

    await get('/cinemas/companies').expect(200, [{ id: 5, name: null }]);
    await get('/cinemas/8').expect(200, branch);
    expect(repository.findCinemaById).toHaveBeenCalledWith(8);
  });

  it('answers 404 for a branch that does not exist', async () => {
    repository.findCinemaById.mockResolvedValue(null);
    const response = await get('/cinemas/99').expect(404);
    expect(response.body.message).toBe('La sucursal seleccionada no existe.');
  });

  it.each([
    '/cinemas/list?pageSize=15',
    '/cinemas/list?search=%20%20',
    '/cinemas/list?companyId=abc',
    '/cinemas/list?status=INACTIVE',
    '/cinemas/0',
    '/cinemas/abc',
  ])('rejects the invalid request %s', async (path) => {
    await get(path).expect(400);
    expect(repository.listCinemas).not.toHaveBeenCalled();
    expect(repository.findCinemaById).not.toHaveBeenCalled();
  });

  it.each(['/cinemas', '/cinemas/list', '/cinemas/companies', '/cinemas/1'])(
    'requires a session for %s',
    async (path) => {
      await get(path, false).expect(401);
    },
  );

  it.each(['/cinemas', '/cinemas/list', '/cinemas/companies', '/cinemas/1'])(
    'answers 403 without data to a regular employee on %s',
    async (path) => {
      users.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role: 'EMPLOYEE',
      });
      const response = await get(path).expect(403);
      expect(response.body).not.toHaveProperty('items');
      expect(repository.getAllCinemas).not.toHaveBeenCalled();
      expect(repository.listCinemas).not.toHaveBeenCalled();
      expect(repository.listCompanies).not.toHaveBeenCalled();
      expect(repository.findCinemaById).not.toHaveBeenCalled();
    },
  );

  it('blocks an administrator whose password expired', async () => {
    users.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
      expirationDays: 90,
    });
    const response = await get('/cinemas/list').expect(403);
    expect(response.body.code).toBe('PASSWORD_EXPIRED');
    expect(repository.listCinemas).not.toHaveBeenCalled();
  });

  describe('POST /cinemas', () => {
    const valid = { name: '  Sucursal Heredia Centro ', companyId: 21 };

    it('creates an active branch and answers 201 with its detail (UT-015)', async () => {
      repository.createCinema.mockResolvedValue(30);
      repository.findCinemaById.mockResolvedValue(created);
      await send('post', '/cinemas', valid).expect(201, created);
      expect(repository.createCinema).toHaveBeenCalledWith({
        name: 'Sucursal Heredia Centro',
        companyId: 21,
      });
    });

    it('answers 400 when the company does not exist or has no name', async () => {
      repository.createCinema.mockResolvedValue('company');
      const response = await send('post', '/cinemas', valid).expect(400);
      expect(response.body.message).toBe('Debe seleccionar una compañía');
    });

    it('answers 409 when an active branch already has the name', async () => {
      repository.createCinema.mockResolvedValue('duplicate');
      const response = await send('post', '/cinemas', valid).expect(409);
      expect(response.body.message).toBe(
        'Ya existe una sucursal activa con ese nombre',
      );
    });

    it('reports every invalid field at once (UT-013)', async () => {
      const response = await send('post', '/cinemas', { name: '' }).expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          'El nombre es obligatorio',
          'Debe seleccionar una compañía',
        ]),
      );
      expect(repository.createCinema).not.toHaveBeenCalled();
    });

    it.each([
      [{ ...valid, status: 'INACTIVE' }],
      [{ ...valid, id: 99 }],
      [{ name: 'Sucursal 01', companyId: 21 }],
    ])('rejects %p without saving', async (body) => {
      await send('post', '/cinemas', body).expect(400);
      expect(repository.createCinema).not.toHaveBeenCalled();
    });

    it('rejects requests from a foreign origin', async () => {
      await send('post', '/cinemas', valid, {
        origin: 'https://evil.example',
      }).expect(403);
      expect(repository.createCinema).not.toHaveBeenCalled();
    });

    it('answers 403 to a regular employee and 401 without a session', async () => {
      users.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role: 'EMPLOYEE',
      });
      await send('post', '/cinemas', valid).expect(403);
      await request(app.getHttpServer())
        .post('/api/cinemas')
        .set('Origin', origin)
        .send(valid)
        .expect(401);
      expect(repository.createCinema).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /cinemas/:id', () => {
    const changes = { name: 'Sucursal Heredia Oeste', companyId: 23 };

    it('modifies an active branch and returns its detail (UT-036)', async () => {
      const modified = {
        ...created,
        id: 26,
        ...changes,
        companyName: 'Cinetadel del Pacifico',
      };
      repository.updateCinema.mockResolvedValue('updated');
      repository.findCinemaById.mockResolvedValue(modified);
      await send('patch', '/cinemas/26', changes).expect(200, modified);
      expect(repository.updateCinema).toHaveBeenCalledWith(26, changes);
    });

    it('answers 404 when the branch is missing or inactive', async () => {
      repository.updateCinema.mockResolvedValue('missing');
      const response = await send('patch', '/cinemas/26', changes).expect(404);
      expect(response.body.message).toBe(
        'La sucursal no existe o ya fue desactivada',
      );
    });

    it('answers 409 when another active branch has the name', async () => {
      repository.updateCinema.mockResolvedValue('duplicate');
      const response = await send('patch', '/cinemas/26', changes).expect(409);
      expect(response.body.message).toBe(
        'Ya existe una sucursal activa con ese nombre',
      );
    });

    it.each([
      [{ name: 'Heredia Centro 2', companyId: 21 }],
      [{ name: 'Sucursal Heredia Centro' }],
      [{ ...changes, status: 'INACTIVE' }],
    ])('rejects %p without saving (UT-027, UT-034)', async (body) => {
      await send('patch', '/cinemas/26', body).expect(400);
      expect(repository.updateCinema).not.toHaveBeenCalled();
    });

    it('rejects a foreign origin, a regular employee and an invalid ID', async () => {
      await send('patch', '/cinemas/26', changes, {
        origin: 'https://evil.example',
      }).expect(403);
      await send('patch', '/cinemas/abc', changes).expect(400);
      users.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role: 'EMPLOYEE',
      });
      await send('patch', '/cinemas/26', changes).expect(403);
      expect(repository.updateCinema).not.toHaveBeenCalled();
    });
  });
});
