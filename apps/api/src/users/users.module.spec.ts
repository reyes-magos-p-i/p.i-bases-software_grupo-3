jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import nodemailer, {
  type Mail,
  type SMTPSentMessageInfo,
  type SendMailOptions,
} from 'nodemailer';
import type oracle from 'oracledb';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHasher } from '../common/security/password-hasher';
import { RandomPasswordGenerator } from '../common/security/random-password-generator.service';
import { Argon2PasswordHasher } from '../common/security/argon2-password-hasher.service';
import { ORACLE_POOL } from '../database/database.module';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { SmtpInitialCredentialsSender } from './notifications/smtp-initial-credentials-sender';

describe('UsersModule (application HTTP integration)', () => {
  let app: INestApplication<App>;
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
  const config = { get: (key: string) => settings[key] };
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
    birthday: '2000-02-29',
    phoneNumber: '88888888',
    branchId: 1,
    address: { districtId: 102, details: 'Casa azul' },
  };

  function buildModule() {
    return Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(ORACLE_POOL)
      .useValue(pool)
      .compile();
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    operations = [];
    settings = {
      NODE_ENV: 'development',
      DEV_ADMIN_ENABLED: 'true',
      DEV_ADMIN_EMPLOYEE_ID: '21',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'test-user',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM: 'cuentas@example.com',
    };
    pool.getConnection.mockResolvedValue(connection);
    pool.close.mockResolvedValue(undefined);
    connection.close.mockResolvedValue(undefined);
    connection.rollback.mockResolvedValue(undefined);
    connection.commit.mockImplementation(() => {
      operations.push('commit');
      return Promise.resolve();
    });
    connection.execute.mockImplementation((sql: string) => {
      if (sql.startsWith('SELECT EMPLOYEE_ID')) {
        return Promise.resolve({
          rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR' }],
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
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('resolves the real password generator, hasher and SMTP sender', () => {
    expect(app.get(PasswordGenerator)).toBeInstanceOf(RandomPasswordGenerator);
    expect(app.get(PasswordHasher)).toBeInstanceOf(Argon2PasswordHasher);
    expect(app.get(InitialCredentialsSender)).toBeInstanceOf(
      SmtpInitialCredentialsSender,
    );
  });

  it.each([client, employee, { ...employee, role: 'ADMINISTRATOR' }])(
    'creates a $role through the registered route and sends credentials after commit',
    async (body) => {
      const response = await request(app.getHttpServer())
        .post('/users')
        .send(body)
        .expect(201);
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

  it('denies production requests before acquiring a connection', async () => {
    settings.NODE_ENV = 'production';
    await request(app.getHttpServer()).post('/users').send(client).expect(403);
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('denies employees even if the requested account is an administrator', async () => {
    connection.execute.mockResolvedValueOnce({
      rows: [{ EMPLOYEE_ID: 21, ROLE: 'EMPLOYEE' }],
    });
    await request(app.getHttpServer())
      .post('/users')
      .send({ ...employee, role: 'ADMINISTRATOR' })
      .expect(403);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('rejects invalid data before any inserts or emails', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .send({ ...client, email: 'invalid' })
      .expect(400);
    expect(operations).toEqual([]);
  });

  it('rolls back persistence failures and never sends credentials', async () => {
    connection.execute
      .mockResolvedValueOnce({
        rows: [{ EMPLOYEE_ID: 21, ROLE: 'ADMINISTRATOR' }],
      })
      .mockResolvedValueOnce({ rowsAffected: 1, outBinds: { addressId: [55] } })
      .mockRejectedValueOnce(new Error('Private Oracle details'));
    const response = await request(app.getHttpServer())
      .post('/users')
      .send(employee)
      .expect(500);
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
    const response = await request(app.getHttpServer())
      .post('/users')
      .send(client)
      .expect(502);
    expect(response.body.message).toBe(
      'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.',
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(operations).toEqual(['insert', 'insert', 'commit']);
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
