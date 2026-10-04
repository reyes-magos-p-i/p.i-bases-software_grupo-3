jest.mock('oracledb', () => ({
  ...jest.requireActual('oracledb'),
  createPool: jest.fn(),
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { EMPLOYEE_SESSION_COOKIE } from '../auth/employee-session.service';
import { Test } from '@nestjs/testing';
import nodemailer, {
  type Mail,
  type SMTPSentMessageInfo,
  type SendMailOptions,
} from 'nodemailer';
import oracle from 'oracledb';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHasher } from '../common/security/password-hasher';
import { RandomPasswordGenerator } from '../common/security/random-password-generator.service';
import { Argon2PasswordHasher } from '../common/security/argon2-password-hasher.service';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { SmtpInitialCredentialsSender } from './notifications/smtp-initial-credentials-sender';

describe('UsersModule (application HTTP integration)', () => {
  let app: INestApplication<App>;
  let browser: ReturnType<typeof request.agent>;
  const origin = 'http://localhost:5173';
  let settings: Record<string, unknown>;
  let operations: string[];
  const sendMail = jest.fn();
  const connection = {
    execute: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    close: jest.fn(),
  };
  const pool = { getConnection: jest.fn(), close: jest.fn() };
  const config = {
    get: (key: string) => settings[key],
    getOrThrow: (key: string) => settings[key] ?? 'test-' + key,
  };
  const client = {
    role: 'CLIENT',
    email: 'Cliente@Example.com',
    firstName: 'Ana',
  };
  const employee = {
    role: 'EMPLOYEE',
    email: 'Empleado@Example.com',
    firstName: 'Ana',
    firstSurname: 'Solano',
    secondSurname: 'Rojas',
    hireDate: '2026-10-01',
    birthday: '2000-02-29',
    phoneNumber: '88888888',
    branchId: 1,
    address: { districtId: 102, details: 'Casa azul' },
  };

  function buildModule() {
    return Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    operations = [];
    settings = {
      NODE_ENV: 'development',
      FRONTEND_URL: origin,
      JWT_SECRET: 'application-test-secret',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'test-user',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM: 'cuentas@example.com',
    };
    (oracle.createPool as jest.Mock<Promise<oracle.Pool>>).mockResolvedValue(
      pool as unknown as oracle.Pool,
    );
    pool.getConnection.mockResolvedValue(connection);
    pool.close.mockResolvedValue(undefined);
    connection.close.mockResolvedValue(undefined);
    connection.rollback.mockResolvedValue(undefined);
    connection.commit.mockImplementation(() => {
      operations.push('commit');
      return Promise.resolve();
    });
    connection.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('SELECT SYS_CONTEXT'))
        return Promise.resolve({ rows: [{ schema: 'TEST' }] });
      if (sql.startsWith('SELECT EMPLOYEE_ID')) {
        return Promise.resolve({
          rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR', FIRST_NAME: 'Ana' }],
        });
      }
      if (sql.startsWith('SELECT 1')) return Promise.resolve({ rows: [] });
      operations.push('insert');
      if (sql.startsWith('INSERT INTO ADDRESSES'))
        return Promise.resolve({
          rowsAffected: 1,
          outBinds: { addressId: [55] },
        });
      if (sql.startsWith('INSERT INTO EMPLOYEES'))
        return Promise.resolve({
          rowsAffected: 1,
          outBinds: { employeeId: [42] },
        });
      if (sql.startsWith('INSERT INTO CLIENTS'))
        return Promise.resolve({
          rowsAffected: 1,
          outBinds: { clientId: [43] },
        });
      if (sql.includes('_LOCAL_CREDENTIALS'))
        return Promise.resolve({ rowsAffected: 1 });
      throw new Error('Unexpected SQL in integration test.');
    });
    sendMail.mockImplementation((mail: SendMailOptions) => {
      operations.push('email');
      return Promise.resolve({
        accepted: [(mail.to as { address: string }).address],
        rejected: [],
      });
    });
    jest
      .mocked(nodemailer.createTransport)
      .mockReturnValue({ sendMail } as unknown as Mail<SMTPSentMessageInfo>);
    const module = await buildModule();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    browser = request
      .agent(app.getHttpServer())
      .set('Origin', origin)
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${app.get(JwtService).sign({ sub: 21, type: 'employee' })}`,
      );
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /users/creation-options', () => {
    it('mounts client and employee listing routes with the actual repositories', async () => {
      connection.execute
        .mockResolvedValueOnce({
          rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR', FIRST_NAME: 'Ana' }],
        })
        .mockResolvedValueOnce({ rows: [{ TOTAL: 0 }] });
      await browser.get('/users/clients').expect(200, {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
      connection.execute
        .mockResolvedValueOnce({
          rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR', FIRST_NAME: 'Ana' }],
        })
        .mockResolvedValueOnce({ rows: [{ TOTAL: 0 }] });
      await browser.get('/users/employees').expect(200, {
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
      expect(sendMail).not.toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
    });
    it('reads Oracle catalogs through the registered route without creating users or sending credentials', async () => {
      const generate = jest.spyOn(app.get(PasswordGenerator), 'generate');
      const hash = jest.spyOn(app.get(PasswordHasher), 'hash');
      connection.execute
        .mockResolvedValueOnce({
          rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR', FIRST_NAME: 'Ana' }],
        })
        .mockResolvedValueOnce({ rows: [{ ID_PROVINCE: 1, NAME: 'San José' }] })
        .mockResolvedValueOnce({
          rows: [{ ID_CANTON: 19, NAME: 'Curridabat', ID_PROVINCE: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ ID_DISTRICT: 102, NAME: 'Curridabat', ID_CANTON: 19 }],
        })
        .mockResolvedValueOnce({
          rows: [{ BRANCH_ID: 1, NAME: 'Cinépolis Multiplaza del Este' }],
        });

      const response = await browser.get('/users/creation-options').expect(200);
      expect(response.body).toEqual({
        provinces: [{ id: 1, label: 'San José' }],
        cantons: [{ id: 19, label: 'Curridabat', provinceId: 1 }],
        districts: [{ id: 102, label: 'Curridabat', cantonId: 19 }],
        branches: [{ id: 1, label: 'Cinépolis Multiplaza del Este' }],
      });
      expect(connection.execute).toHaveBeenCalledTimes(5);
      const statements = connection.execute.mock.calls as [
        string,
        unknown,
        unknown,
      ][];
      expect(statements.every(([sql]) => sql.startsWith('SELECT '))).toBe(true);
      expect(pool.getConnection).toHaveBeenCalledTimes(5);
      expect(connection.close).toHaveBeenCalledTimes(5);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
      generate.mockRestore();
      hash.mockRestore();
    });

    it('denies missing authentication before any Oracle query', async () => {
      await request(app.getHttpServer())
        .get('/users/creation-options')
        .expect(401);
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    it('does not return partial catalogs if a later query fails', async () => {
      connection.execute
        .mockResolvedValueOnce({
          rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR', FIRST_NAME: 'Ana' }],
        })
        .mockResolvedValueOnce({ rows: [{ ID_PROVINCE: 1, NAME: 'San José' }] })
        .mockRejectedValueOnce(new Error('Private Oracle catalog error'));
      const response = await browser.get('/users/creation-options').expect(500);
      expect(response.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(connection.close).toHaveBeenCalledTimes(3);
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  it('resolves the real password generator, hasher and SMTP sender', () => {
    expect(app.get(PasswordGenerator)).toBeInstanceOf(RandomPasswordGenerator);
    expect(app.get(PasswordHasher)).toBeInstanceOf(Argon2PasswordHasher);
    expect(app.get(InitialCredentialsSender)).toBeInstanceOf(
      SmtpInitialCredentialsSender,
    );
  });

  it('logs in through the mounted auth module and creates only with the authenticated cookie', async () => {
    const password = 'Integration password';
    const { passwordHash } = await app.get(PasswordHasher).hash(password);
    const execute = connection.execute.getMockImplementation()!;
    connection.execute.mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.startsWith('SELECT e.EMPLOYEE_ID'))
        return Promise.resolve({
          rows: [
            {
              EMPLOYEE_ID: 21,
              ROLE: 'ADMINISTRATOR',
              EMAIL: 'staff@example.com',
              FIRST_NAME: 'Ana',
              SECOND_NAME: null,
              FIRST_SURNAME: 'Solano',
              SECOND_SURNAME: 'Rojas',
              CREDENTIALS_EMPLOYEE_ID: 21,
              PASSWORD_HASH: passwordHash,
            },
          ],
        });
      return execute(sql, ...args);
    });
    const response = await request(app.getHttpServer())
      .post('/auth/employees/login')
      .set('Origin', origin)
      .send({ email: 'staff@example.com', password })
      .expect(200);
    expect(response.body).not.toHaveProperty('accessToken');
    const cookie = (
      response.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    // Nest receives paths without /api after proxy rewriting, so forward the browser cookie explicitly.
    const authenticated = request
      .agent(app.getHttpServer())
      .set('Cookie', cookie)
      .set('Origin', origin);
    await authenticated
      .get('/auth/me')
      .expect(200, { id: 21, role: 'ADMINISTRATOR', firstName: 'Ana' });
    await authenticated.post('/users').send(client).expect(201);
    const calls = connection.execute.mock.calls.length;
    await request(app.getHttpServer()).post('/users').send(client).expect(401);
    expect(connection.execute).toHaveBeenCalledTimes(calls);
  });

  it('uses the current role rather than role claims or development flags', async () => {
    settings.DEV_ADMIN_ENABLED = 'true';
    settings.DEV_ADMIN_EMPLOYEE_ID = '21';
    const cookie = `${EMPLOYEE_SESSION_COOKIE}=${app.get(JwtService).sign({ sub: 21, type: 'employee', role: 'ADMINISTRATOR' })}`;
    connection.execute.mockResolvedValueOnce({
      rows: [{ EMPLOYEE_ID: 21, ROLE: 'EMPLOYEE', FIRST_NAME: 'Ana' }],
    });
    await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ ...employee, role: 'ADMINISTRATOR' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/users/creation-options')
      .expect(401);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each([client, employee, { ...employee, role: 'ADMINISTRATOR' }])(
    'creates a $role through the registered route and sends credentials after commit',
    async (body) => {
      const response = await browser.post('/users').send(body).expect(201);
      expect(response.body).toEqual({
        id: body.role === 'CLIENT' ? 43 : 42,
        role: body.role,
        email: body.role === 'CLIENT' ? body.email.toLowerCase() : body.email,
      });
      expect(operations).toEqual(
        body.role === 'CLIENT'
          ? ['insert', 'insert', 'commit', 'email']
          : ['insert', 'insert', 'insert', 'commit', 'email'],
      );
      const insertCalls = connection.execute.mock.calls as [
        string,
        Record<string, oracle.BindParameter>,
      ][];
      const credentialsInsert = insertCalls.find(([sql]) =>
        sql.includes('_LOCAL_CREDENTIALS'),
      )!;
      const hash = credentialsInsert[1].passwordHash.val as string;
      const salt = credentialsInsert[1].salt.val as string;
      expect(hash).toMatch(/^\$argon2id\$/u);
      expect(salt).toBeTruthy();
      const message = sendMail.mock.calls[0][0] as SendMailOptions;
      const password = (message.text as string)
        .split('Contraseña inicial: ')[1]
        .split('\n')[0];
      expect(password).toMatch(/^[A-Za-z0-9_-]{32}$/u);
      expect(JSON.stringify(insertCalls)).not.toContain(password);
      expect(response.text).not.toContain(password);
      expect(response.text).not.toContain(hash);
      expect(response.text).not.toContain(salt);
      expect(connection.rollback).not.toHaveBeenCalled();
    },
  );

  it('denies unauthenticated requests before acquiring a connection', async () => {
    await request(app.getHttpServer()).post('/users').send(client).expect(401);
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('denies employees even if the requested account is an administrator', async () => {
    connection.execute.mockResolvedValueOnce({
      rows: [{ EMPLOYEE_ID: 21, ROLE: 'EMPLOYEE', FIRST_NAME: 'Ana' }],
    });
    await browser
      .post('/users')
      .send({ ...employee, role: 'ADMINISTRATOR' })
      .expect(403);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rejects invalid data before any inserts or emails', async () => {
    await browser
      .post('/users')
      .send({ ...client, email: 'invalid' })
      .expect(400);
    expect(operations).toEqual([]);
  });

  it('rolls back persistence failures and never sends credentials', async () => {
    connection.execute
      .mockResolvedValueOnce({
        rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR', FIRST_NAME: 'Ana' }],
      })
      .mockResolvedValueOnce({ rowsAffected: 1, outBinds: { addressId: [55] } })
      .mockRejectedValueOnce(new Error('Private Oracle details'));
    const response = await browser.post('/users').send(employee).expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('returns 502 after commit when SMTP fails, without recreating the account or retrying email', async () => {
    sendMail.mockRejectedValue(new Error('Private SMTP details'));
    const response = await browser.post('/users').send(client).expect(502);
    expect(response.body.message).toBe(
      'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.',
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(operations).toEqual(['insert', 'insert', 'commit']);
  });

  it('persists an administrative client address without asserting terms acceptance', async () => {
    await browser
      .post('/users')
      .send({ ...client, address: { districtId: 102, details: 'Casa azul' } })
      .expect(201);
    const [, binds] = connection.execute.mock.calls.find(([sql]: [string]) =>
      sql.startsWith('INSERT INTO CLIENTS'),
    )!;
    expect(binds.addressId.val).toBe(55);
    expect(binds.terms.val).toBe(0);
    expect(binds.gender.val).toBeNull();
    expect(binds).not.toHaveProperty('language');
    expect(operations).toEqual([
      'insert',
      'insert',
      'insert',
      'commit',
      'email',
    ]);
  });

  it('returns 409 and does not send credentials when a client email races with another creation', async () => {
    const execute = connection.execute.getMockImplementation()!;
    connection.execute.mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.startsWith('INSERT INTO CLIENTS')) {
        return Promise.reject({
          errorNum: 1,
          message: 'ORA-00001: (PRODUCTION.UQ_CLIENTS_EMAIL)',
        });
      }
      return execute(sql, ...args);
    });
    const response = await browser.post('/users').send(client).expect(409);
    expect(response.text).not.toContain('ORA-00001');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('prevents module initialization when required SMTP configuration is missing', async () => {
    delete settings.SMTP_PASSWORD;
    await expect(buildModule()).rejects.toThrow(
      'Missing or invalid SMTP configuration: SMTP_PASSWORD.',
    );
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
