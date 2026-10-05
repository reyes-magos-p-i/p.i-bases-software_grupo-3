import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// Exercise production decorator metadata using the compiled application.
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
const { DatabaseService } = runtime(
  '../dist/database/database.service.js',
) as typeof import('../src/database/database.service');
const { PasswordHasher } = runtime(
  '../dist/common/security/password-hasher.js',
) as typeof import('../src/common/security/password-hasher');
const { EmailVerificationSender } = runtime(
  '../dist/auth/notifications/email-verification-sender.js',
) as typeof import('../src/auth/notifications/email-verification-sender');

describe('Compiled client login', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  let passwordHash: string;
  let active: boolean;
  let pending: boolean;
  const origin = 'http://localhost:5173';
  const credentials = {
    email: 'ana@example.com',
    password: ' Exact password 🎬 ',
  };
  const profile = {
    id: 7,
    email: credentials.email,
    firstName: 'Ana',
    firstSurname: 'Rojas',
  };
  const database = { query: jest.fn(), transaction: jest.fn() };
  const sender = { send: jest.fn() };
  const login = (body: unknown = credentials) =>
    request(app.getHttpServer())
      .post('/api/auth/clients/login')
      .set('Origin', origin)
      .send(body as object);

  beforeEach(async () => {
    jest.clearAllMocks();
    active = true;
    pending = false;
    database.query
      .mockReset()
      .mockImplementation((sql: string, binds: { email?: string }) => {
        if (sql.includes('CLIENT_EMAIL_VERIFICATIONS'))
          return Promise.resolve({ rows: pending ? [{ pending: 1 }] : [] });
        const matches =
          active && (!binds.email || binds.email === credentials.email);
        return Promise.resolve({
          rows: matches ? [{ ...profile, status: 'ACTIVE', passwordHash }] : [],
        });
      });
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ FRONTEND_URL: origin, NODE_ENV: 'test' })[key],
        getOrThrow: () => 'client-login-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(EmailVerificationSender)
      .useValue(sender)
      .compile();
    passwordHash ??= (
      await module.get(PasswordHasher).hash(credentials.password)
    ).passwordHash;
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

  afterEach(async () => {
    await app?.close();
  });

  it('normalizes the email, preserves password whitespace and issues a usable client session', async () => {
    const response = await login({
      ...credentials,
      email: ' ANA@Example.COM ',
    }).expect(200);
    expect(response.body.client).toEqual({
      id: 7,
      email: credentials.email,
      firstName: 'Ana',
      lastName: 'Rojas',
    });
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    const payload = jwt.verify(response.body.accessToken as string);
    expect(payload).toMatchObject({ sub: 7, type: 'client' });
    const session = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(session.body).toMatchObject(profile);
    expect(database.transaction).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { ...credentials, email: 'invalid' },
    { ...credentials, password: '' },
    { ...credentials, password: 'x'.repeat(129) },
    { ...credentials, role: 'ADMINISTRATOR' },
    { ...credentials, email: ['ana@example.com'] },
  ])('rejects invalid input before querying the database: %p', async (body) => {
    const response = await login(body).expect(400);
    expect(response.body.statusCode).toBe(400);
    expect(database.query).not.toHaveBeenCalled();
  });

  it.each([
    { ...credentials, password: 'wrong' },
    { ...credentials, email: 'missing@example.com' },
  ])(
    'returns the same generic response for invalid credentials: %p',
    async (body) => {
      const response = await login(body).expect(401);
      expect(response.body.message).toBe('Correo o contraseña incorrectos');
      expect(response.body).not.toHaveProperty('accessToken');
    },
  );

  it('rejects inactive clients using the active-account query', async () => {
    active = false;
    const response = await login().expect(401);
    expect(response.body.message).toBe('Correo o contraseña incorrectos');
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("c.status = 'ACTIVE'"),
      { email: credentials.email },
    );
  });

  it('requires confirmation only after a correct password and permits login once confirmed', async () => {
    pending = true;
    const wrong = await login({ ...credentials, password: 'wrong' }).expect(
      401,
    );
    expect(wrong.body).not.toHaveProperty('code');
    const unconfirmed = await login().expect(403);
    expect(unconfirmed.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    expect(unconfirmed.body).not.toHaveProperty('accessToken');
    pending = false;
    const confirmed = await login().expect(200);
    expect(confirmed.body.client.id).toBe(7);
  });

  it('rejects a previously valid token after deactivation', async () => {
    const response = await login().expect(200);
    active = false;
    const session = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(401);
    expect(session.body.statusCode).toBe(401);
  });

  it('rejects expired tokens before loading client data', async () => {
    const token = jwt.sign({ sub: 7, type: 'client' }, { expiresIn: -1 });
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(response.body.statusCode).toBe(401);
    expect(database.query).not.toHaveBeenCalled();
  });

  it('blocks excessive attempts before password verification and returns a retry delay', async () => {
    for (let attempt = 0; attempt < 5; attempt++) await login({}).expect(400);
    const response = await login().expect(429);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(database.query).not.toHaveBeenCalled();
  });

  it.each([undefined, 'https://foreign.example'])(
    'rejects unauthorized origin %p',
    async (value) => {
      const call = login();
      if (value) call.set('Origin', value);
      else call.unset('Origin');
      const response = await call.expect(403);
      expect(response.body.message).toContain('origen');
      expect(database.query).not.toHaveBeenCalled();
    },
  );

  it('does not expose private persistence errors', async () => {
    database.query.mockRejectedValueOnce(new Error('private Oracle details'));
    const response = await login().expect(500);
    expect(response.text).not.toContain('private Oracle');
    expect(response.body).not.toHaveProperty('accessToken');
  });
});
