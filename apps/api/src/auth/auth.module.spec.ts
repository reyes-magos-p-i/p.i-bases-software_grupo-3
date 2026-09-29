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
    await module.close();
  });

  it('wires AuthController, AuthService and ClientsService', () => {
    expect(module.get(AuthController)).toBeDefined();
    expect(module.get(AuthService)).toBeDefined();
    expect(module.get(ClientsService)).toBeDefined();
    expect(module.get(PasswordHasher)).toBeInstanceOf(Argon2PasswordHasher);
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
