import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as oracledb from 'oracledb';
import { DatabaseService } from './database.service';

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
  let mockPool: { getConnection: jest.Mock };

  // Arm testing module with arbitrary schema
  async function initService(schema: string | undefined) {
    mockConnection = {
      execute: jest.fn(),
      close: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    };
    mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
    };
    (oracledb.createPool as jest.Mock).mockResolvedValue(mockPool);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => `mock-${key}`),
            get: jest.fn(() => schema),
          },
        },
      ],
    }).compile();

    return module.get<DatabaseService>(DatabaseService);
  }

  beforeEach(async () => {
    service = await initService(undefined); // DB_SCHEMA empty by default

    mockConnection.execute.mockResolvedValueOnce({ rows: [{ schema: 'MOCK_SCHEMA' }] });
    await service.onModuleInit();
    mockConnection.execute.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
      mockConnection.execute.mockResolvedValue({ rows: [{ schema: 'MY_SCHEMA' }] });

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
  });
});

