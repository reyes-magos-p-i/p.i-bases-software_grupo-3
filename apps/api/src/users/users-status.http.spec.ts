import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import oracle from 'oracledb';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../auth/auth.module';
import { EMPLOYEE_SESSION_COOKIE } from '../auth/employee-session.service';
import { EmailVerificationSender } from '../auth/notifications/email-verification-sender';
import { PasswordRecoverySender } from '../auth/notifications/password-recovery-sender';
import { PasswordRecoveryRepository } from '../auth/password-recovery.repository';
import { ClientsService } from '../clients/clients.service';
import { DatabaseService } from '../database/database.service';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHasher } from '../common/security/password-hasher';
import { UserRole } from './enums/user-role.enum';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersPersistenceModule } from './users-persistence.module';
import { ClientsModule } from '../clients/clients.module';
import { PasswordHashingModule } from '../common/security/password-hashing.module';
import { UsersUpdateController } from './users-update.controller';
import type { UserStatus } from './types/user-status.type';

describe('User status and session lifecycle with mocked persistence', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let users: UsersRepository;
  let recovery: PasswordRecoveryRepository;
  const origin = 'http://localhost:5173';
  const secret = randomUUID();
  const password = randomUUID();
  let accountType: 'client' | 'employee';
  let account: {
    status: UserStatus;
    version: string | null;
    resetAt: Date | null;
    tokenHash: string | null;
    passwordHash: string;
  };
  const clients = {
    findById: jest.fn(),
    findWithLocalCredentials: jest.fn(),
    isEmailVerificationPending: jest.fn(),
    findPasswordStatus: jest.fn(),
  };
  const execute = jest.fn();
  const connection = { execute } as unknown as oracle.Connection;
  const db = {
    transaction: (work: (connection: oracle.Connection) => Promise<unknown>) =>
      work(connection),
    query: jest.fn(),
  };
  const passwordStatus = { setAt: new Date(), expirationDays: 90 };
  const identity = {
    id: 42,
    role: UserRole.EMPLOYEE as const,
    email: 'staff@example.com',
    firstName: 'Ana',
  };

  function authorize(
    call: request.Test,
    type: 'client' | 'employee',
    token: string,
  ) {
    return type === 'client'
      ? call.set('Authorization', 'Bearer ' + token)
      : call.set('Cookie', EMPLOYEE_SESSION_COOKIE + '=' + token);
  }
  async function login(type: 'client' | 'employee') {
    const response = await request(app.getHttpServer())
      .post(
        '/api/auth/' + (type === 'client' ? 'clients' : 'employees') + '/login',
      )
      .set('Origin', origin)
      .send({ email: identity.email, password })
      .expect(200);
    if (type === 'client') return response.body.accessToken as string;
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies[0].split(';')[0].slice(EMPLOYEE_SESSION_COOKIE.length + 1);
  }
  function transition(
    type: 'client' | 'employee',
    action: 'activate' | 'deactivate',
  ) {
    const section = type === 'client' ? 'clients' : 'employees';
    return request(app.getHttpServer())
      .patch('/api/users/' + section + '/42/' + action)
      .set('Origin', origin)
      .set(
        'Cookie',
        EMPLOYEE_SESSION_COOKIE +
          '=' +
          jwt.sign({ sub: 21, type: 'employee', sessionVersion: null }),
      )
      .send({});
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
        UsersPersistenceModule,
        ClientsModule,
        PasswordHashingModule,
      ],
      controllers: [UsersUpdateController],
      providers: [
        UsersService,
        { provide: PasswordGenerator, useValue: { generate: jest.fn() } },
        { provide: InitialCredentialsSender, useValue: { send: jest.fn() } },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ NODE_ENV: 'test', FRONTEND_URL: origin })[key],
        getOrThrow: () => secret,
      })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .overrideProvider(ClientsService)
      .useValue(clients)
      .overrideProvider(PasswordHasher)
      .useValue({ verify: jest.fn().mockResolvedValue(true) })
      .overrideProvider(PasswordRecoverySender)
      .useValue({ send: jest.fn(), notifyChanged: jest.fn() })
      .overrideProvider(EmailVerificationSender)
      .useValue({ send: jest.fn() })
      .compile();
    users = module.get(UsersRepository);
    recovery = module.get(PasswordRecoveryRepository);
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
    accountType = 'client';
    account = {
      status: 'ACTIVE',
      version: null,
      resetAt: null,
      tokenHash: 'pending-recovery',
      passwordHash: 'original-hash',
    };
    execute
      .mockReset()
      .mockImplementation((sql: string, binds: Record<string, unknown>) => {
        if (sql.includes('FROM PASSWORD_RECOVERIES WHERE TOKEN_HASH')) {
          return {
            rows:
              account.tokenHash === binds.tokenHash
                ? [
                    {
                      CLIENT_ID: accountType === 'client' ? 42 : null,
                      EMPLOYEE_ID: accountType === 'employee' ? 42 : null,
                      TOKEN_HASH: account.tokenHash,
                      TEMPORARY_HASH: 'temporary-hash',
                      CREDENTIAL_HASH: account.passwordHash,
                      EMAIL: identity.email,
                      EXPIRES_AT: new Date(Date.now() + 60000),
                    },
                  ]
                : [],
          };
        }
        if (sql.includes('SELECT a.') && sql.includes('PASSWORD_HASH')) {
          return {
            rows:
              account.status === 'ACTIVE'
                ? [
                    {
                      ID: 42,
                      EMAIL: identity.email,
                      FIRST_NAME: identity.firstName,
                      PASSWORD_HASH: account.passwordHash,
                    },
                  ]
                : [],
          };
        }
        if (sql.includes('SELECT ROLE FROM EMPLOYEES'))
          return { rows: [{ ROLE: UserRole.ADMINISTRATOR }] };
        if (sql.includes('SELECT ROLE, STATUS'))
          return {
            rows: [{ ROLE: UserRole.EMPLOYEE, STATUS: account.status }],
          };
        if (sql.includes('SELECT STATUS FROM CLIENTS'))
          return { rows: [{ STATUS: account.status }] };
        if (sql.startsWith('UPDATE'))
          account.status = binds.status as UserStatus;
        if (sql.includes('MERGE INTO PASSWORD_RECOVERIES')) {
          account.version = randomUUID();
          account.resetAt = new Date();
          account.tokenHash = null;
        }
        return { rowsAffected: 1 };
      });
    db.query
      .mockReset()
      .mockImplementation((sql: string, binds: { accountId?: number }) => {
        if (sql.includes('SELECT RESET_AT'))
          return {
            rows:
              binds.accountId === 21
                ? []
                : [
                    {
                      RESET_AT: account.resetAt,
                      SESSION_VERSION: account.version,
                    },
                  ],
          };
        throw new Error('Unexpected database query: ' + sql);
      });
    jest
      .spyOn(users, 'findEmployeeIdentityById')
      .mockImplementation((id) =>
        Promise.resolve(
          id === 21
            ? { ...identity, id: 21, role: UserRole.ADMINISTRATOR as const }
            : account.status === 'ACTIVE'
              ? identity
              : null,
        ),
      );
    jest
      .spyOn(users, 'findEmployeeCredentialsStatus')
      .mockResolvedValue(passwordStatus);
    jest
      .spyOn(users, 'findEmployeeWithLocalCredentialsByEmail')
      .mockImplementation(() =>
        Promise.resolve(
          account.status === 'ACTIVE'
            ? {
                ...identity,
                secondName: null,
                firstSurname: 'Núñez',
                secondSurname: 'Rojas',
                passwordHash: account.passwordHash,
                sessionVersion: account.version,
              }
            : null,
        ),
      );
    clients.findById.mockImplementation(() =>
      Promise.resolve(
        account.status === 'ACTIVE'
          ? { ...identity, role: 'CLIENT', status: account.status }
          : null,
      ),
    );
    clients.findWithLocalCredentials.mockImplementation(() =>
      Promise.resolve({
        ...identity,
        status: account.status,
        passwordHash: account.passwordHash,
        sessionVersion: account.version,
      }),
    );
    clients.isEmailVerificationPending.mockResolvedValue(false);
    clients.findPasswordStatus.mockResolvedValue(passwordStatus);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it.each(['client', 'employee'] as const)(
    'requires a fresh %s login after reactivation and never revives old sessions or recovery links',
    async (type) => {
      accountType = type;
      await expect(recovery.find('pending-recovery')).resolves.toMatchObject({
        ID: 42,
        accountType: type,
      });
      const oldToken = await login(type);
      const legacyToken = jwt.sign({ sub: 42, type });
      await authorize(
        request(app.getHttpServer()).get('/api/auth/password-status'),
        type,
        oldToken,
      ).expect(200);
      await transition(type, 'deactivate').expect(204);
      expect(account.status).toBe('INACTIVE');
      expect(account.tokenHash).toBeNull();
      const firstVersion = account.version;
      await authorize(
        request(app.getHttpServer()).get('/api/auth/me'),
        type,
        oldToken,
      ).expect(401);
      const rejectedLogin = await request(app.getHttpServer())
        .post(
          '/api/auth/' +
            (type === 'client' ? 'clients' : 'employees') +
            '/login',
        )
        .set('Origin', origin)
        .send({ email: identity.email, password })
        .expect(401);
      expect(rejectedLogin.body.message).toBe(
        'Correo o contraseña incorrectos',
      );
      await transition(type, 'activate').expect(204);
      expect(account.status).toBe('ACTIVE');
      expect(account.version).not.toBe(firstVersion);
      expect(account.passwordHash).toBe('original-hash');
      await expect(recovery.find('pending-recovery')).resolves.toBeNull();
      for (const token of [oldToken, legacyToken]) {
        await authorize(
          request(app.getHttpServer()).get('/api/auth/me'),
          type,
          token,
        ).expect(401);
        await authorize(
          request(app.getHttpServer()).get('/api/auth/password-status'),
          type,
          token,
        ).expect(401);
      }
      const freshToken = await login(type);
      expect(jwt.decode(freshToken).sessionVersion).toBe(account.version);
      const current = await authorize(
        request(app.getHttpServer()).get('/api/auth/password-status'),
        type,
        freshToken,
      ).expect(200);
      expect(current.body).toEqual({
        status: 'valid',
        expirationDays: 90,
        expiresInDays: null,
      });
    },
  );
});
