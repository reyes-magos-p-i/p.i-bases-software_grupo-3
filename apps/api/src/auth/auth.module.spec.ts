import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { verify } from 'argon2';
import { AuthModule } from './auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { DatabaseService } from '../database/database.service';
import { DatabaseModule } from '../database/database.module';
import { PasswordHasher } from '../common/security/password-hasher';
import { Argon2PasswordHasher } from '../common/security/argon2-password-hasher.service';
import { JwtService } from '@nestjs/jwt';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { UsersRepository } from '../users/users.repository';
import { UserRole } from '../users/enums/user-role.enum';

describe('AuthModule', () => {
  let module: TestingModule;
  const connection = { execute: jest.fn() };
  const db = { query: jest.fn(), transaction: jest.fn() };
  let committed: boolean;

  beforeEach(async () => {
    jest.resetAllMocks();
    committed = false;
    db.transaction.mockImplementation(
      async (work: (conn: unknown) => Promise<unknown>) => {
        const result = await work(connection);
        committed = true;
        return result;
      },
    );
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        AuthModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: () => 'test-jwt-secret' })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await module.close();
  });

  it('wires AuthController, AuthService and ClientsService', () => {
    expect(module.get(AuthController)).toBeDefined();
    expect(module.get(AuthService)).toBeDefined();
    expect(module.get(ClientsService)).toBeDefined();
    expect(module.get(PasswordHasher)).toBeInstanceOf(Argon2PasswordHasher);
    expect(module.get(UsersRepository)).toBeInstanceOf(UsersRepository);
    expect(module.get(ThrottlerGuard)).toBeDefined();
  });

  it('keeps independent login quotas for different IP addresses', async () => {
    await module.init();
    const guard = module.get(ThrottlerGuard);
    const contextFor = (ip: string) =>
      ({
        getHandler: () => AuthController.prototype.loginEmployee,
        getClass: () => AuthController,
        switchToHttp: () => ({
          getRequest: () => ({ ip, headers: {} }),
          getResponse: () => ({ header: jest.fn() }),
        }),
      }) as unknown as ExecutionContext;
    const firstIp = contextFor('192.0.2.1');
    const secondIp = contextFor('192.0.2.2');
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(guard.canActivate(firstIp)).resolves.toBe(true);
    }
    await expect(guard.canActivate(firstIp)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    await expect(guard.canActivate(secondIp)).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  describe('employee authentication integration', () => {
    const password = ' Staff password 🎬 ';
    const email = 'Staff@Example.com';

    async function storedEmployee(role = UserRole.EMPLOYEE) {
      const credentials = await module.get(PasswordHasher).hash(password);
      return {
        EMPLOYEE_ID: 21,
        ROLE: role,
        EMAIL: email,
        FIRST_NAME: 'Ana',
        SECOND_NAME: 'María',
        FIRST_SURNAME: 'Solano',
        SECOND_SURNAME: 'Rojas',
        CREDENTIALS_EMPLOYEE_ID: 21,
        PASSWORD_HASH: credentials.passwordHash,
      };
    }

    it.each([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR])(
      'verifies the stored hash and signs a verifiable employee token for %s',
      async (role) => {
        const row = await storedEmployee(role);
        db.query.mockResolvedValue({ rows: [row] });
        const result = await module
          .get(AuthService)
          .loginEmployee({ email: '  ' + email + '  ', password });
        expect(result.user).toEqual({
          id: 21,
          role,
          email,
          firstName: 'Ana',
          secondName: 'María',
          firstSurname: 'Solano',
          secondSurname: 'Rojas',
        });
        const payload = module
          .get(JwtService)
          .verify<Record<string, unknown>>(result.accessToken);
        expect(payload).toEqual({
          sub: 21,
          type: 'employee',
          iat: expect.any(Number),
          exp: expect.any(Number),
        });
        expect((payload.exp as number) - (payload.iat as number)).toBe(
          60 * 60 * 24,
        );
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query.mock.calls[0][1]).toMatchObject({
          email: { val: 'staff@example.com' },
        });
        expect(JSON.stringify(result)).not.toContain(row.PASSWORD_HASH);
        expect(db.transaction).not.toHaveBeenCalled();
      },
    );

    it('rejects an incorrect password with the real verifier and never signs a token', async () => {
      db.query.mockResolvedValue({ rows: [await storedEmployee()] });
      const sign = jest.spyOn(module.get(JwtService), 'signAsync');
      await expect(
        module
          .get(AuthService)
          .loginEmployee({ email, password: 'Incorrect password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sign).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it.each(['absent', 'without credentials', 'matching reference password'])(
      'executes a real reference verification but rejects an account that is %s',
      async (scenario) => {
        const rows =
          scenario === 'without credentials'
            ? [
                {
                  EMPLOYEE_ID: 21,
                  ROLE: UserRole.EMPLOYEE,
                  CREDENTIALS_EMPLOYEE_ID: null,
                  PASSWORD_HASH: null,
                },
              ]
            : [];
        db.query.mockResolvedValue({ rows });
        const verifier = jest.spyOn(module.get(PasswordHasher), 'verify');
        const sign = jest.spyOn(module.get(JwtService), 'signAsync');
        await expect(
          module.get(AuthService).loginEmployee({
            email,
            password:
              scenario === 'matching reference password'
                ? 'Cinema test password'
                : password,
          }),
        ).rejects.toMatchObject({
          response: {
            statusCode: 401,
            message: 'Correo o contraseña incorrectos',
          },
        });
        expect(verifier).toHaveBeenCalledTimes(1);
        expect(sign).not.toHaveBeenCalled();
      },
    );

    it('propagates malformed stored hashes as internal failures', async () => {
      db.query.mockResolvedValue({
        rows: [
          {
            EMPLOYEE_ID: 21,
            ROLE: UserRole.ADMINISTRATOR,
            CREDENTIALS_EMPLOYEE_ID: 21,
            PASSWORD_HASH: 'malformed-hash',
          },
        ],
      });
      const sign = jest.spyOn(module.get(JwtService), 'signAsync');
      const failure: unknown = await module
        .get(AuthService)
        .loginEmployee({ email, password })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(UnauthorizedException);
      expect(sign).not.toHaveBeenCalled();
    });

    it('rejects ambiguous accounts before verification or token issuance', async () => {
      db.query.mockResolvedValue({
        rows: [{ EMPLOYEE_ID: 21 }, { EMPLOYEE_ID: 22 }],
      });
      const verifier = jest.spyOn(module.get(PasswordHasher), 'verify');
      const sign = jest.spyOn(module.get(JwtService), 'signAsync');
      await expect(
        module.get(AuthService).loginEmployee({ email, password }),
      ).rejects.toThrow('Employee email lookup returned multiple accounts.');
      expect(verifier).not.toHaveBeenCalled();
      expect(sign).not.toHaveBeenCalled();
    });
  });

  it('registers with the real shared hasher and client repository while preserving terms and padded salt', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockImplementation(async () => {
        expect(committed).toBe(true);
        return { rows: [{ id: 42, email: 'cliente@example.com' }] };
      });
    connection.execute
      .mockResolvedValueOnce({ rowsAffected: 1, outBinds: { clientId: [42] } })
      .mockResolvedValueOnce({ rowsAffected: 1 });
    const password = 'Test-password-123!';
    await expect(
      module.get(AuthService).register({
        email: 'cliente@example.com',
        firstName: 'Ana Maria',
        lastName: 'Perez Mora',
        phone: '88888888',
        birthDate: '2000-05-10',
        gender: 'F',
        language: 'en',
        password,
        acceptTerms: true,
      }),
    ).resolves.toEqual({ id: 42, email: 'cliente@example.com' });
    const [profileSql, profileBinds] = connection.execute.mock.calls[0];
    expect(profileSql).toContain('INSERT INTO CLIENTS');
    expect(profileBinds).toMatchObject({
      firstName: { val: 'Ana' },
      secondName: { val: 'Maria' },
      firstSurname: { val: 'Perez' },
      secondSurname: { val: 'Mora' },
      gender: { val: 'F' },
      terms: { val: 1 },
      language: { val: 'en' },
      addressId: { val: null },
    });
    const credentials = connection.execute.mock.calls[1][1];
    expect(credentials.passwordHash.val).toContain(
      '$argon2id$v=19$m=65536,t=3,p=4$',
    );
    expect(credentials.salt.val).toMatch(/^[A-Za-z0-9+/]{22}==$/u);
    await expect(verify(credentials.passwordHash.val, password)).resolves.toBe(
      true,
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenCalledTimes(2);
  });
});
