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
import { EMPLOYEE_SESSION_COOKIE } from './employee-session.service';

describe('Employee authentication (HTTP integration)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let passwordHash: string;
  const db = { query: jest.fn(), transaction: jest.fn() };
  const password = ' Staff password 🎬 ';
  const login = { email: 'staff@example.com', password };
  const origin = 'http://localhost:5173';
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

  beforeEach(async () => {
    db.query.mockReset();
    db.transaction.mockReset();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: () => 'http-test-jwt-secret',
        get: (key: string) => ({ FRONTEND_URL: origin, NODE_ENV: 'test' })[key],
      })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
    app = module.createNestApplication({ logger: false });
    // Simulate the external /api path so the test cookie jar enforces its real path.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    jwt = module.get(JwtService);
    passwordHash ??= (await module.get(PasswordHasher).hash(password))
      .passwordHash;
    db.query.mockResolvedValue({ rows: [employeeRow()] });
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('logs out the browser and rejects its next authenticated request', async () => {
    const browser = request.agent(app.getHttpServer());
    await browser
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .send(login)
      .expect(200);
    await browser.get('/api/auth/me').expect(200);
    db.query.mockClear();
    const response = await browser
      .post('/api/auth/employees/logout')
      .set('Origin', origin)
      .expect(204);
    expect(response.text).toBe('');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie'][0]).toContain('Path=/api');
    expect(response.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    await browser.get('/api/auth/me').expect(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('limits visitors independently behind a trusted local proxy and ignores a forged leftmost IP', async () => {
    const adapter = app.getHttpAdapter().getInstance() as {
      set: (name: string, value: string) => void;
    };
    adapter.set('trust proxy', 'loopback');
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .set('X-Forwarded-For', '198.51.100.10')
        .send({})
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.10')
      .send({})
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', '198.51.100.11')
      .send({})
      .expect(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([undefined, 'invalid', 'expired'])(
    'allows logout without a valid session (%p)',
    async (cookie) => {
      const call = request(app.getHttpServer())
        .post('/api/auth/employees/logout')
        .set('Origin', origin);
      if (cookie) call.set('Cookie', `${EMPLOYEE_SESSION_COOKIE}=${cookie}`);
      await call.expect(204);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'https://untrusted.example'])(
    'rejects logout from an untrusted origin: %p',
    async (source) => {
      const call = request(app.getHttpServer()).post(
        '/api/auth/employees/logout',
      );
      if (source) call.set('Origin', source);
      const response = await call.expect(403);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    'null',
    'invalid',
    'https://evil.example',
    'http://localhost:5174',
    'http://localhost:5173.evil.example',
  ])(
    'rejects an unauthorized Origin before accessing credentials: %p',
    async (untrustedOrigin) => {
      const verify = jest.spyOn(app.get(PasswordHasher), 'verify');
      const call = request(app.getHttpServer()).post(
        '/api/auth/employees/login',
      );
      if (untrustedOrigin !== undefined) call.set('Origin', untrustedOrigin);
      const response = await call.send(login).expect(403);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(db.query).not.toHaveBeenCalled();
      expect(verify).not.toHaveBeenCalled();
    },
  );

  it.each(['invalid', 'expired', 'wrong signature', 'client', 'empty', 'json'])(
    'rejects an invalid employee cookie (%s) before accessing persistence',
    async (scenario) => {
      let token = 'invalid';
      if (scenario === 'expired')
        token = jwt.sign({ sub: 21, type: 'employee' }, { expiresIn: -1 });
      if (scenario === 'wrong signature')
        token = jwt.sign(
          { sub: 21, type: 'employee' },
          { secret: 'wrong-secret' },
        );
      if (scenario === 'client') token = jwt.sign({ sub: 21, type: 'client' });
      if (scenario === 'empty') token = '';
      if (scenario === 'json') token = 'j:{"token":"invalid"}';
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set(
          'Cookie',
          `${EMPLOYEE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
        )
        .expect(401);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it.each(['same token', 'different token', 'malformed cookie'])(
    'rejects simultaneous cookie and Bearer credentials (%s)',
    async (scenario) => {
      const token = jwt.sign({ sub: 21, type: 'employee' });
      const cookie = scenario === 'malformed cookie' ? 'invalid' : token;
      const bearer =
        scenario === 'different token'
          ? jwt.sign({ sub: 22, type: 'employee' })
          : token;
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', `${EMPLOYEE_SESSION_COOKIE}=${cookie}`)
        .auth(bearer, { type: 'bearer' })
        .expect(401);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it('checks the current identity and never renews the cookie during session recovery', async () => {
    const browser = request.agent(app.getHttpServer());
    await browser
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .send(login)
      .expect(200);
    db.query.mockResolvedValueOnce({
      rows: [employeeRow(UserRole.ADMINISTRATOR)],
    });
    const recovered = await browser
      .get('/api/auth/me')
      .expect(200, { id: 21, role: UserRole.ADMINISTRATOR, firstName: 'Ana' });
    expect(recovered.headers['set-cookie']).toBeUndefined();
    db.query.mockResolvedValueOnce({ rows: [] });
    await browser.get('/api/auth/me').expect(401);
  });

  it('rejects a previously working session at the original JWT expiration', async () => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const response = await request(app.getHttpServer())
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .send(login)
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies[0].split(';')[0];
    clock.mockReturnValue(now + 86_399_000);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    db.query.mockClear();
    clock.mockReturnValue(now + 86_400_000);
    const expired = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
    expect(expired.headers['set-cookie']).toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([
    { scenario: 'successful logins', body: login, status: 200, calls: 5 },
    {
      scenario: 'incorrect passwords',
      body: { ...login, password: 'incorrect password' },
      status: 401,
      calls: 5,
    },
    { scenario: 'invalid input', body: {}, status: 400, calls: 0 },
  ])(
    'limits $scenario before accessing Oracle or verifying passwords',
    async ({ body, status, calls }) => {
      const verify = jest.spyOn(app.get(PasswordHasher), 'verify');
      for (let attempt = 0; attempt < 5; attempt++) {
        const response = await request(app.getHttpServer())
          .post('/api/auth/employees/login')
          .set('Origin', origin)
          .send(body)
          .expect(status);
        expect(response.headers['x-ratelimit-limit']).toBe('5');
        expect(response.headers['x-ratelimit-remaining']).toBe(
          String(4 - attempt),
        );
      }
      const blocked = await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .send(login)
        .expect(429);
      expect(blocked.body).toEqual({
        statusCode: 429,
        message:
          'Demasiadas solicitudes de inicio de sesión. Espere antes de intentarlo de nuevo.',
      });
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
      expect(db.query).toHaveBeenCalledTimes(calls);
      expect(verify).toHaveBeenCalledTimes(calls);
    },
  );

  it('does not bypass the IP quota by changing email or forwarding headers', async () => {
    const verify = jest.spyOn(app.get(PasswordHasher), 'verify');
    for (let attempt = 0; attempt < 6; attempt++) {
      await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .set('X-Forwarded-For', `192.0.2.${attempt + 1}`)
        .set('X-Real-IP', `192.0.2.${attempt + 1}`)
        .send({ email: `staff${attempt}@example.com` })
        .expect(attempt < 5 ? 400 : 429);
    }
    expect(db.query).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('allows requests after the block expires without extending the wait on retries', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    for (let attempt = 0; attempt < 6; attempt++) {
      await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .send({})
        .expect(attempt < 5 ? 400 : 429);
    }
    clock.mockReturnValue(now + 59_999);
    const blocked = await request(app.getHttpServer())
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .send(login)
      .expect(429);
    expect(blocked.headers['retry-after']).toBe('1');
    expect(db.query).not.toHaveBeenCalled();
    clock.mockReturnValue(now + 60_000);
    await request(app.getHttpServer())
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .send(login)
      .expect(200);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('expires unused quota after one minute even without reaching the limit', async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    for (let attempt = 0; attempt < 4; attempt++) {
      await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .send({})
        .expect(400);
    }
    clock.mockReturnValue(now + 60_000);
    const response = await request(app.getHttpServer())
      .post('/api/auth/employees/login')
      .set('Origin', origin)
      .send({})
      .expect(400);
    expect(response.headers['x-ratelimit-remaining']).toBe('4');
  });

  it('does not apply the login quota to identity or registration routes', async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .send({})
        .expect(attempt < 5 ? 400 : 429);
    }
    const token = jwt.sign({ sub: 21, type: 'employee' });
    for (let attempt = 0; attempt < 6; attempt++) {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200, { id: 21, role: UserRole.EMPLOYEE, firstName: 'Ana' });
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({})
        .expect(400);
    }
    expect(db.query).toHaveBeenCalledTimes(6);
  });

  it.each([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR])(
    'logs in %s and recovers identity through the session cookie',
    async (role) => {
      db.query.mockResolvedValue({ rows: [employeeRow(role)] });
      const browser = request.agent(app.getHttpServer());
      const response = await browser
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .send({ ...login, email: '  Staff@Example.COM  ' })
        .expect(200);
      expect(response.body).toEqual({ user: { ...profile, role } });
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain(`${EMPLOYEE_SESSION_COOKIE}=`);
      expect(cookies[0]).toContain('Path=/api');
      expect(cookies[0]).toContain('HttpOnly');
      expect(cookies[0]).toContain('SameSite=Strict');
      expect(cookies[0]).not.toContain('Domain=');
      expect(cookies[0]).not.toContain('Secure');
      expect(response.headers['cache-control']).toBe('no-store');
      const token = cookies[0]
        .split(';')[0]
        .slice(EMPLOYEE_SESSION_COOKIE.length + 1);
      expect(jwt.verify<Record<string, unknown>>(token)).toEqual({
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
      const recovered = await browser
        .get('/api/auth/me')
        .expect(200, { id: 21, role, firstName: 'Ana' });
      expect(recovered.headers['set-cookie']).toBeUndefined();
      expect(recovered.headers['cache-control']).toBe('no-store');
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
      .post('/api/auth/employees/login')
      .set('Origin', origin)
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
      const response = await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .send({ ...login, password: 'incorrect password' })
        .expect(401, {
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Correo o contraseña incorrectos',
        });
      expect(sign).not.toHaveBeenCalled();
      expect(response.headers['set-cookie']).toBeUndefined();
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
      const response = await request(app.getHttpServer())
        .post('/api/auth/employees/login')
        .set('Origin', origin)
        .send(login)
        .expect(500, { statusCode: 500, message: 'Internal server error' });
      expect(response.headers['set-cookie']).toBeUndefined();
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
      const call = request(app.getHttpServer()).get('/api/auth/me');
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
        .get('/api/auth/me')
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
        .get('/api/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(200, { id: 21, role, firstName: 'Ana' });
    }
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it.each([
    { rows: [] },
    { rows: [{ EMPLOYEE_ID: 21, ROLE: 'CLIENT', FIRST_NAME: 'Ana' }] },
  ])(
    'rejects a missing or invalid persisted employee identity: %p',
    async ({ rows }) => {
      db.query.mockResolvedValue({ rows });
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .auth(jwt.sign({ sub: 21, type: 'employee' }), { type: 'bearer' })
        .expect(401);
    },
  );

  it('reports identity lookup failures as internal errors rather than invalid credentials', async () => {
    db.query.mockRejectedValue(new Error('Private Oracle detail'));
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(jwt.sign({ sub: 21, type: 'employee' }), { type: 'bearer' })
      .expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });

  it('preserves client token validation and the existing client profile', async () => {
    const client = {
      status: 'ACTIVE' as const,
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
      .get('/api/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(200, client);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM Clients'),
      { id: 21 },
    );
    db.query.mockResolvedValue({ rows: [] });
    const revoked = await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(401);
    expect(revoked.body.statusCode).toBe(401);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining("c.status = 'ACTIVE'"),
      { id: 21 },
    );
  });
});
