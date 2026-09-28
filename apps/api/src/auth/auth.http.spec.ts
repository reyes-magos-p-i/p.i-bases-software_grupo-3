import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PasswordHasher } from '../common/security/password-hasher';
import { DatabaseService } from '../database/database.service';
import { UserRole } from '../users/enums/user-role.enum';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';

describe('Employee authentication (HTTP integration)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let passwordHash: string;
  const db = { query: jest.fn(), transaction: jest.fn() };
  const password = ' Staff password 🎬 ';
  const login = { email: 'staff@example.com', password };
  const profile = {
    id: 21,
    role: UserRole.EMPLOYEE,
    email: 'staff@example.com',
    firstName: 'Ana',
    secondName: null,
    firstSurname: 'Solano',
    secondSurname: 'Rojas',
  };

  function employeeRow(role = UserRole.EMPLOYEE) {
    return {
      EMPLOYEE_ID: 21,
      ROLE: role,
      EMAIL: profile.email,
      FIRST_NAME: profile.firstName,
      SECOND_NAME: profile.secondName,
      FIRST_SURNAME: profile.firstSurname,
      SECOND_SURNAME: profile.secondSurname,
      CREDENTIALS_EMPLOYEE_ID: 21,
      PASSWORD_HASH: passwordHash,
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: () => 'http-test-jwt-secret' })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    jwt = module.get(JwtService);
    passwordHash = (await module.get(PasswordHasher).hash(password))
      .passwordHash;
    await app.init();
  });

  beforeEach(() => {
    db.query.mockReset().mockResolvedValue({ rows: [employeeRow()] });
    db.transaction.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR])(
    'logs in %s and authenticates the returned token',
    async (role) => {
      db.query.mockResolvedValue({ rows: [employeeRow(role)] });
      const response = await request(app.getHttpServer())
        .post('/auth/employees/login')
        .send({ ...login, email: '  Staff@Example.COM  ' })
        .expect(200);
      const body = response.body as { accessToken: string; user: unknown };
      expect(body).toEqual({
        accessToken: expect.any(String),
        user: { ...profile, role },
      });
      expect(jwt.verify<Record<string, unknown>>(body.accessToken)).toEqual({
        sub: 21,
        type: 'employee',
        iat: expect.any(Number),
        exp: expect.any(Number),
      });
      expect(db.query.mock.calls[0][1]).toMatchObject({
        email: { val: 'staff@example.com' },
      });
      expect(response.text).not.toContain(passwordHash);
      expect(response.text).not.toContain(password);
      await request(app.getHttpServer())
        .get('/auth/me')
        .auth(body.accessToken, { type: 'bearer' })
        .expect(200, { id: 21, role });
      expect(db.query.mock.calls[1][1]).toMatchObject({
        employeeId: { val: 21 },
      });
    },
  );

  it.each([
    {},
    { email: login.email },
    { password },
    { ...login, email: 'invalid-email' },
    { ...login, email: 123 },
    { ...login, password: '' },
    { ...login, password: 123 },
    { ...login, password: 'a'.repeat(129) },
    { ...login, role: 'ADMINISTRATOR' },
  ])('rejects invalid input before querying Oracle: %#', async (body) => {
    const response = await request(app.getHttpServer())
      .post('/auth/employees/login')
      .send(body)
      .expect(400);
    expect(response.body).toMatchObject({ statusCode: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each(['incorrect password', 'absent employee', 'missing credentials'])(
    'returns the same credential error for %s',
    async (scenario) => {
      if (scenario === 'absent employee') {
        db.query.mockResolvedValue({ rows: [] });
      } else if (scenario === 'missing credentials') {
        db.query.mockResolvedValue({
          rows: [
            {
              ...employeeRow(),
              CREDENTIALS_EMPLOYEE_ID: null,
              PASSWORD_HASH: null,
            },
          ],
        });
      }
      const sign = jest.spyOn(jwt, 'signAsync');
      await request(app.getHttpServer())
        .post('/auth/employees/login')
        .send({ ...login, password: 'incorrect password' })
        .expect(401, {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Correo o contraseña incorrectos',
        });
      expect(sign).not.toHaveBeenCalled();
    },
  );

  it.each(['database', 'stored hash', 'signer'])(
    'hides internal details when the %s fails',
    async (scenario) => {
      if (scenario === 'database') {
        db.query.mockRejectedValue(new Error('Private database detail'));
      } else if (scenario === 'stored hash') {
        db.query.mockResolvedValue({
          rows: [{ ...employeeRow(), PASSWORD_HASH: 'invalid-stored-hash' }],
        });
      } else {
        jest
          .spyOn(jwt, 'signAsync')
          .mockRejectedValue(new Error('Private key detail'));
      }
      await request(app.getHttpServer())
        .post('/auth/employees/login')
        .send(login)
        .expect(500, { statusCode: 500, message: 'Internal server error' });
    },
  );

  it.each(['missing', 'malformed', 'expired', 'invalid signature'])(
    'rejects a %s token before querying Oracle',
    async (scenario) => {
      let token: string | undefined;
      if (scenario === 'malformed') token = 'invalid-token';
      if (scenario === 'expired') {
        token = jwt.sign({ sub: 21, type: 'employee' }, { expiresIn: -1 });
      }
      if (scenario === 'invalid signature') {
        token = jwt.sign(
          { sub: 21, type: 'employee' },
          { secret: 'different-test-secret' },
        );
      }
      const call = request(app.getHttpServer()).get('/auth/me');
      if (token) call.auth(token, { type: 'bearer' });
      await call.expect(401);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    { sub: 0, type: 'employee' },
    { sub: '21', type: 'employee' },
    { sub: 21, type: 'administrator' },
    { sub: 21 },
  ])(
    'rejects signed tokens with invalid identity claims: %p',
    async (claims) => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .auth(jwt.sign(claims), { type: 'bearer' })
        .expect(401);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it('reads the current role on every request instead of trusting role claims', async () => {
    const token = jwt.sign({
      sub: 21,
      type: 'employee',
      role: 'ADMINISTRATOR',
    });
    db.query
      .mockResolvedValueOnce({ rows: [employeeRow(UserRole.ADMINISTRATOR)] })
      .mockResolvedValueOnce({ rows: [employeeRow(UserRole.EMPLOYEE)] });
    for (const role of [UserRole.ADMINISTRATOR, UserRole.EMPLOYEE]) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200, { id: 21, role });
    }
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it.each([{ rows: [] }, { rows: [{ EMPLOYEE_ID: 21, ROLE: 'CLIENT' }] }])(
    'rejects a missing or invalid persisted employee identity: %p',
    async ({ rows }) => {
      db.query.mockResolvedValue({ rows });
      await request(app.getHttpServer())
        .get('/auth/me')
        .auth(jwt.sign({ sub: 21, type: 'employee' }), { type: 'bearer' })
        .expect(401);
    },
  );

  it('reports identity lookup failures as internal errors rather than invalid credentials', async () => {
    db.query.mockRejectedValue(new Error('Private Oracle detail'));
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(jwt.sign({ sub: 21, type: 'employee' }), { type: 'bearer' })
      .expect(500, { statusCode: 500, message: 'Internal server error' });
  });

  it('preserves client token validation and the existing client profile', async () => {
    const client = {
      id: 21,
      email: 'client@example.com',
      firstName: 'Ana',
      secondName: null,
      firstSurname: null,
      secondSurname: null,
      birthday: null,
      phoneNumber: null,
      gender: null,
      language: 'es',
    };
    db.query.mockResolvedValue({ rows: [client] });
    const { accessToken } = app.get(AuthService).issueToken(client);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(200, client);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM Clients'),
      { id: 21 },
    );
  });
});
