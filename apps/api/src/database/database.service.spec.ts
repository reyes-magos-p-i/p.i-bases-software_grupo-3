import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as oracledb from 'oracledb';
import {
  DatabaseService,
  REQUIRED_DATABASE_VARIABLES,
  missingDatabaseVariablesMessage,
} from './database.service';

// db service mock
jest.mock('oracledb', () => ({
  createPool: jest.fn(),
  OUT_FORMAT_OBJECT: 'OBJECT',
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockConnection: {
    execute: jest.Mock;
    close: jest.Mock;
    commit: jest.Mock;
    rollback: jest.Mock;
  };
  let mockPool: { getConnection: jest.Mock; close: jest.Mock };

  // Arm testing module with an arbitrary schema; `overrides` replaces any other variable.
  async function initService(
    schema: string | undefined,
    overrides: Record<string, string | undefined> = {},
  ) {
    mockConnection = {
      execute: jest.fn(),
      close: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    };
    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      close: jest.fn(),
    };
    (oracledb.createPool as jest.Mock).mockResolvedValue(mockPool);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key in overrides
                ? overrides[key]
                : key === 'DB_SCHEMA'
                  ? schema
                  : `mock-${key}`,
            ),
          },
        },
      ],
    }).compile();

    return module.get<DatabaseService>(DatabaseService);
  }

  beforeEach(async () => {
    service = await initService('MOCK_SCHEMA');

    mockConnection.execute.mockResolvedValueOnce({
      rows: [{ schema: 'MOCK_SCHEMA' }],
    });
    await service.onModuleInit();
    mockConnection.execute.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('handles empty or undefined rows gracefully during onModuleInit schema check', async () => {
    const svc1 = await initService('MOCK_SCHEMA');
    mockConnection.execute.mockResolvedValueOnce({});
    await expect(svc1.onModuleInit()).resolves.not.toThrow();

    const svc2 = await initService('MOCK_SCHEMA');
    mockConnection.execute.mockResolvedValueOnce({ rows: [] });
    await expect(svc2.onModuleInit()).resolves.not.toThrow();
  });

  describe('query', () => {
    it('executes SQL and always closes the connection', async () => {
      mockConnection.execute.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await service.query('SELECT 1 FROM dual');

      expect(mockPool.getConnection).toHaveBeenCalled();
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'SELECT 1 FROM dual',
        {},
        expect.objectContaining({ autoCommit: true }),
      );
      expect(mockConnection.close).toHaveBeenCalled();
      expect(result.rows).toEqual([{ id: 1 }]);
    });

    it('closes the connection even if execute throws', async () => {
      mockConnection.execute.mockRejectedValue(new Error('boom'));

      await expect(service.query('SELECT 1 FROM dual')).rejects.toThrow('boom');
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    it('commits and closes the connection when the work succeeds', async () => {
      const result = await service.transaction(async (conn) => {
        await conn.execute('INSERT INTO foo VALUES (1)');
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.rollback).not.toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('rolls back and closes the connection when the work throws', async () => {
      await expect(
        service.transaction(async () => {
          throw new Error('insert failed');
        }),
      ).rejects.toThrow('insert failed');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.commit).not.toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('required database variables', () => {
    it.each(REQUIRED_DATABASE_VARIABLES.filter((name) => name !== 'DB_SCHEMA'))(
      'does not open the pool and names %s when it is missing',
      async (name) => {
        const incomplete = await initService('PRODUCTION', {
          [name]: undefined,
        });
        (oracledb.createPool as jest.Mock).mockClear();

        await expect(incomplete.onModuleInit()).rejects.toThrow(
          `Falta la variable de entorno ${name}. Configúrala en apps/api/.env.`,
        );
        expect(oracledb.createPool).not.toHaveBeenCalled();
      },
    );

    it('names every missing variable at once and never shows the values', async () => {
      const incomplete = await initService(undefined, {
        DB_PASSWORD: '  ',
        DB_WALLET_PASSWORD: '',
        DB_USER: 'CINETADEL_APP',
      });
      (oracledb.createPool as jest.Mock).mockClear();

      const error = await incomplete.onModuleInit().catch((e: Error) => e);

      expect(error).toEqual(
        new Error(
          'Faltan las variables de entorno DB_PASSWORD, DB_WALLET_PASSWORD, DB_SCHEMA. Configúralas en apps/api/.env.',
        ),
      );
      expect((error as Error).message).not.toContain('CINETADEL_APP');
      expect(oracledb.createPool).not.toHaveBeenCalled();
    });

    it('builds the singular and plural messages', () => {
      expect(missingDatabaseVariablesMessage(['DB_USER'])).toBe(
        'Falta la variable de entorno DB_USER. Configúrala en apps/api/.env.',
      );
      expect(missingDatabaseVariablesMessage(['DB_USER', 'DB_SCHEMA'])).toBe(
        'Faltan las variables de entorno DB_USER, DB_SCHEMA. Configúralas en apps/api/.env.',
      );
    });

    it('passes the configured credentials and wallet to the pool', async () => {
      const configured = await initService('PRODUCTION');
      (oracledb.createPool as jest.Mock).mockClear();
      mockConnection.execute.mockResolvedValue({
        rows: [{ schema: 'PRODUCTION' }],
      });

      await configured.onModuleInit();

      expect(oracledb.createPool).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'mock-DB_USER',
          password: 'mock-DB_PASSWORD',
          connectString: 'mock-DB_CONNECT_STRING',
          walletPassword: 'mock-DB_WALLET_PASSWORD',
        }),
      );
    });
  });

  describe('DB_SCHEMA validation', () => {
    it('rejects a schema with characters that could break the SQL', async () => {
      const badService = await initService("'; DROP TABLE users; --");
      (oracledb.createPool as jest.Mock).mockClear();

      await expect(badService.onModuleInit()).rejects.toThrow(
        'DB_SCHEMA tiene caracteres no permitidos',
      );
      expect(oracledb.createPool).not.toHaveBeenCalled();
    });

    it('sets CURRENT_SCHEMA via sessionCallback when DB_SCHEMA is valid', async () => {
      const schemaService = await initService('MY_SCHEMA');
      (oracledb.createPool as jest.Mock).mockClear();
      mockConnection.execute.mockResolvedValue({
        rows: [{ schema: 'MY_SCHEMA' }],
      });

      await schemaService.onModuleInit();

      const poolOptions = (oracledb.createPool as jest.Mock).mock.calls[0][0];
      const sessionConn = { execute: jest.fn().mockResolvedValue(undefined) };
      const done = jest.fn();
      await poolOptions.sessionCallback(sessionConn, null, done);

      expect(sessionConn.execute).toHaveBeenCalledWith(
        'ALTER SESSION SET CURRENT_SCHEMA = MY_SCHEMA',
      );
      expect(done).toHaveBeenCalledWith();
    });

    it.each([undefined, '', '   '])(
      'does not start without DB_SCHEMA (%p) instead of using the user schema',
      async (schema) => {
        const noSchemaService = await initService(schema);
        (oracledb.createPool as jest.Mock).mockClear();

        await expect(noSchemaService.onModuleInit()).rejects.toThrow(
          'Falta la variable de entorno DB_SCHEMA. Configúrala en apps/api/.env.',
        );
        expect(oracledb.createPool).not.toHaveBeenCalled();
      },
    );

    it('trims DB_SCHEMA before setting CURRENT_SCHEMA', async () => {
      const schemaService = await initService(' DEVELOPMENT ');
      (oracledb.createPool as jest.Mock).mockClear();
      mockConnection.execute.mockResolvedValue({
        rows: [{ schema: 'DEVELOPMENT' }],
      });
      await schemaService.onModuleInit();

      const poolOptions = (oracledb.createPool as jest.Mock).mock.calls[0][0];
      const sessionConn = { execute: jest.fn().mockResolvedValue(undefined) };
      await poolOptions.sessionCallback(sessionConn, null, jest.fn());

      expect(sessionConn.execute).toHaveBeenCalledWith(
        'ALTER SESSION SET CURRENT_SCHEMA = DEVELOPMENT',
      );
    });

    it('sessionCallback passes the error to done() when ALTER SESSION fails', async () => {
      const schemaService = await initService('GOOD_SCHEMA');
      (oracledb.createPool as jest.Mock).mockClear();
      mockConnection.execute.mockResolvedValue({
        rows: [{ schema: 'GOOD_SCHEMA' }],
      });
      await schemaService.onModuleInit();

      const poolOptions = (oracledb.createPool as jest.Mock).mock.calls[0][0];
      const error = new Error('ALTER failed');
      const failConn = { execute: jest.fn().mockRejectedValue(error) };
      const done = jest.fn();

      await poolOptions.sessionCallback(failConn, null, done);

      expect(done).toHaveBeenCalledWith(error);
    });
  });

  describe('onModuleDestroy', () => {
    it('closes the pool with a 5-second drain period', async () => {
      await service.onModuleDestroy();

      expect(mockPool.close).toHaveBeenCalledWith(5);
    });

    it('does nothing if the pool was never initialized', async () => {
      const freshService = await initService(undefined);
      // No need for calling onModuleInit, pool is undefined

      await expect(freshService.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  it('logs gracefully when the schema check returns no rows', async () => {
    const svc = await initService('MOCK_SCHEMA');
    mockConnection.execute.mockResolvedValueOnce({ rows: [] }); // no rows
    await expect(svc.onModuleInit()).resolves.not.toThrow();
  });
});
