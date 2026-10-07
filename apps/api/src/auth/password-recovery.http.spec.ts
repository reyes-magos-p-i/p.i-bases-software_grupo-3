import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from './auth.module';
import {
  PasswordRecoveryRepository,
  type Recovery,
} from './password-recovery.repository';
import { PasswordRecoverySender } from './notifications/password-recovery-sender';
import { EmailVerificationSender } from './notifications/email-verification-sender';
import {
  PasswordHasher,
  type PasswordHashResult,
} from '../common/security/password-hasher';
import { DatabaseService } from '../database/database.service';
import { ClientsService } from '../clients/clients.service';
import { UsersRepository } from '../users/users.repository';

describe('Password recovery HTTP flow', () => {
  let app: INestApplication<App>;
  let currentHash: string;
  let originalHash: string;
  let pending: Recovery | null;
  let attempts: number;
  let resetAt: number;
  let jwt: JwtService;
  const origin = 'https://cinema.example';
  const email = 'ana@example.com';
  const password = 'PreviousSecret123!';
  const newPassword = 'ReplacementSecret123!';
  const sender = { send: jest.fn(), notifyChanged: jest.fn() };
  const repository = {
    request: jest.fn(),
    find: jest.fn(),
    complete: jest.fn(),
    failAttempt: jest.fn(),
    invalidate: jest.fn(),
    sessionRevoked: jest.fn(),
  };
  const identity = {
    id: 7,
    email,
    firstName: 'Ana',
    firstSurname: 'Rojas',
    status: 'ACTIVE',
    role: 'ADMINISTRATOR',
  };
  const post = (action: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/auth/password-recovery/${action}`)
      .set('Origin', origin)
      .send(body);

  beforeEach(async () => {
    jest.resetAllMocks();
    pending = null;
    attempts = 0;
    resetAt = 0;
    repository.request.mockImplementation(
      (
        accountType: 'client' | 'employee',
        target: string,
        tokenHash: string,
        temporaryHash: string,
      ) => {
        if (target !== email) return Promise.resolve(null);
        pending = {
          ID: 7,
          EMAIL: email,
          FIRST_NAME: 'Ana',
          PASSWORD_HASH: currentHash,
          accountType,
          tokenHash,
          temporaryHash,
          expiresAt: new Date(Date.now() + 1_800_000),
        };
        return Promise.resolve(pending);
      },
    );
    repository.find.mockImplementation((hash: string) =>
      Promise.resolve(
        pending?.tokenHash === hash &&
          attempts < 5 &&
          pending.expiresAt.getTime() > Date.now()
          ? pending
          : null,
      ),
    );
    repository.complete.mockImplementation(
      (_record: Recovery, credentials: PasswordHashResult) => {
        currentHash = credentials.passwordHash;
        resetAt = Date.now();
        pending = null;
        return Promise.resolve(true);
      },
    );
    repository.failAttempt.mockImplementation(() => {
      attempts++;
      return Promise.resolve();
    });
    repository.invalidate.mockImplementation(() => {
      pending = null;
      return Promise.resolve();
    });
    repository.sessionRevoked.mockImplementation(
      (_type: string, _id: number, iat: number) =>
        Promise.resolve(resetAt > 0 && iat * 1000 <= resetAt),
    );
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ FRONTEND_URL: origin, NODE_ENV: 'test' })[key],
        getOrThrow: (key: string) =>
          key === 'FRONTEND_URL' ? origin : 'recovery-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(PasswordRecoveryRepository)
      .useValue(repository)
      .overrideProvider(PasswordRecoverySender)
      .useValue(sender)
      .overrideProvider(EmailVerificationSender)
      .useValue({ send: jest.fn() })
      .overrideProvider(ClientsService)
      .useValue({
        findWithLocalCredentials: () =>
          Promise.resolve({ ...identity, passwordHash: currentHash }),
        findById: () => Promise.resolve(identity),
        isEmailVerificationPending: () => Promise.resolve(false),
        findPasswordStatus: () => Promise.resolve(null),
      })
      .overrideProvider(UsersRepository)
      .useValue({
        findEmployeeWithLocalCredentialsByEmail: () =>
          Promise.resolve({ ...identity, passwordHash: currentHash }),
        findEmployeeIdentityById: () => Promise.resolve(identity),
        findEmployeeCredentialsStatus: () =>
          Promise.resolve({ setAt: new Date(), expirationDays: 90 }),
      })
      .compile();
    originalHash ??= (await module.get(PasswordHasher).hash(password))
      .passwordHash;
    currentHash = originalHash;
    jwt = module.get(JwtService);
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function start(accountType: 'client' | 'employee' = 'client') {
    await post('request', { email, accountType });
    const mail = sender.send.mock.calls[0][0] as {
      recoveryUrl: string;
      temporaryPassword: string;
    };
    return {
      token: new URL(mail.recoveryUrl).hash.slice(1),
      temporaryPassword: mail.temporaryPassword,
      newPassword,
      confirmNewPassword: newPassword,
      expirationDays: 90,
    };
  }

  it.each(['client', 'employee'] as const)(
    'recovers %s access, rejects the old password and revokes its previous session',
    async (accountType) => {
      const oldToken = jwt.sign({
        sub: 7,
        type: accountType,
        iat: Math.floor(Date.now() / 1000) - 10,
      });
      const input = await start(accountType);
      const validation = await post('validate', { token: input.token });
      expect(validation.status).toBe(200);
      expect(validation.body).toMatchObject({ accountType });
      expect(validation.body).not.toHaveProperty('email');
      const result = await post('reset', input);
      expect(result.status).toBe(200);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(result.body)).not.toContain(newPassword);
      const reused = await post('reset', input);
      expect(reused.status).toBe(400);
      expect(reused.body.code).toBe('RECOVERY_INVALID');
      const oldSession = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(oldSession.status).toBe(401);
      const loginPath = `/api/auth/${accountType === 'client' ? 'clients' : 'employees'}/login`;
      const oldLogin = await request(app.getHttpServer())
        .post(loginPath)
        .set('Origin', origin)
        .send({ email, password });
      const newLogin = await request(app.getHttpServer())
        .post(loginPath)
        .set('Origin', origin)
        .send({ email, password: newPassword });
      expect(oldLogin.status).toBe(401);
      expect(newLogin.status).toBe(200);
      expect(sender.notifyChanged).toHaveBeenCalledWith(email);
    },
  );

  it('does not reveal whether an email is registered', async () => {
    const missing = await post('request', {
      email: 'missing@example.com',
      accountType: 'client',
    });
    const existing = await post('request', { email, accountType: 'client' });
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual(existing.body);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('limits automated requests', async () => {
    for (let i = 0; i < 5; i++)
      await post('request', {
        email: 'missing@example.com',
        accountType: 'client',
      });
    const blocked = await post('request', { email, accountType: 'client' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(repository.request).toHaveBeenCalledTimes(5);
  });

  it('rejects an untrusted request origin', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/auth/password-recovery/request')
      .set('Origin', 'https://other.example')
      .send({ email, accountType: 'client' });
    expect(result.status).toBe(403);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it.each([
    ['request', { email: 'invalid', accountType: 'client' }],
    ['request', { email, accountType: 'administrator' }],
    ['validate', { token: 'invalid' }],
    [
      'reset',
      {
        token: 'a'.repeat(64),
        temporaryPassword: 'temporary',
        newPassword,
        confirmNewPassword: newPassword,
        expirationDays: 91,
      },
    ],
    ['request', { email, accountType: 'client', role: 'ADMINISTRATOR' }],
  ])(
    'rejects invalid %s input before accessing persistence',
    async (action, body) => {
      const result = await post(action as string, body as object);
      expect(result.status).toBe(400);
      expect(repository.request).not.toHaveBeenCalled();
      expect(repository.find).not.toHaveBeenCalled();
    },
  );

  it('rejects expiration and allows requesting new instructions', async () => {
    const input = await start();
    pending!.expiresAt = new Date(0);
    const result = await post('validate', { token: input.token });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('RECOVERY_INVALID');
    expect(currentHash).toBe(originalHash);
  });

  it('limits wrong temporary passwords and never changes the current password', async () => {
    const input = await start();
    for (let i = 0; i < 5; i++)
      await post('reset', { ...input, temporaryPassword: 'wrong' });
    const result = await post('validate', { token: input.token });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('RECOVERY_INVALID');
    expect(repository.failAttempt).toHaveBeenCalledTimes(5);
    expect(currentHash).toBe(originalHash);
  });

  it('reports mismatched passwords without consuming the recovery', async () => {
    const input = await start();
    const result = await post('reset', {
      ...input,
      confirmNewPassword: 'Different123!',
    });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('PASSWORDS_DO_NOT_MATCH');
    expect(repository.complete).not.toHaveBeenCalled();
    expect(pending).not.toBeNull();
  });
});
