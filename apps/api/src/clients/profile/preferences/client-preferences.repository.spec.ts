jest.mock('oracledb', () => ({
  ...jest.requireActual('oracledb'),
  createPool: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import oracle from 'oracledb';
import { DatabaseService } from '../../../database/database.service';
import { ClientPreferencesRepository } from './client-preferences.repository';

describe('ClientPreferencesRepository', () => {
  let module: TestingModule;
  let repository: ClientPreferencesRepository;
  const connection = {
    execute: jest.fn(),
    executeMany: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    close: jest.fn(),
  };
  const pool = { getConnection: jest.fn(), close: jest.fn() };
  beforeEach(async () => {
    jest.resetAllMocks();
    connection.execute.mockResolvedValue({ rows: [] });
    pool.getConnection.mockResolvedValue(connection);
    (oracle.createPool as jest.Mock<Promise<oracle.Pool>>).mockResolvedValue(
      pool as unknown as oracle.Pool,
    );
    module = await Test.createTestingModule({
      providers: [
        ClientPreferencesRepository,
        DatabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: () => undefined,
            getOrThrow: (key: string) => 'test-' + key,
          },
        },
      ],
    }).compile();
    await module.init();
    jest.clearAllMocks();
    repository = module.get(ClientPreferencesRepository);
  });
  afterEach(async () => {
    await module.close();
  });

  function selectedAccount(genres: number[], languages: number[]) {
    connection.execute.mockResolvedValueOnce({ rows: [{ STATUS: 'ACTIVE' }] });
    for (const ids of [genres, languages]) {
      if (ids.length)
        connection.execute.mockResolvedValueOnce({
          rows: ids.map((id) => ({ ID: id })),
        });
    }
  }

  it('reads both collections for the active session account without a Cartesian join', async () => {
    connection.execute.mockResolvedValueOnce({
      rows: [
        { KIND: 'ACCOUNT', OPTION_ID: 7 },
        { KIND: 'GENRE', OPTION_ID: 1 },
        { KIND: 'GENRE', OPTION_ID: 2 },
        { KIND: 'LANGUAGE', OPTION_ID: 3 },
      ],
    });
    await expect(repository.getPreferences(7)).resolves.toEqual({
      genreIds: [1, 2],
      languageIds: [3],
    });
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('UNION ALL'),
      { id: { val: 7, type: oracle.NUMBER } },
      expect.objectContaining({ autoCommit: true }),
    );
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });
  it('returns empty arrays for an active client without preferences', async () => {
    connection.execute.mockResolvedValueOnce({
      rows: [{ KIND: 'ACCOUNT', OPTION_ID: 7 }],
    });
    await expect(repository.getPreferences(7)).resolves.toEqual({
      genreIds: [],
      languageIds: [],
    });
  });
  it.each([{}, { rows: [] }, { rows: [{ KIND: 'ACCOUNT', OPTION_ID: 8 }] }])(
    'rejects unavailable accounts %p',
    async (result) => {
      connection.execute.mockResolvedValueOnce(result);
      await expect(repository.getPreferences(7)).rejects.toMatchObject({
        status: 401,
      });
    },
  );
  it('locks the client and stores both normalized selections in one transaction', async () => {
    selectedAccount([1, 2], [3, 4]);
    connection.executeMany.mockResolvedValue({ rowsAffected: 2 });
    const data = { genreIds: [2, 1], languageIds: [4, 3] };
    await expect(repository.savePreferences(7, data)).resolves.toEqual({
      genreIds: [1, 2],
      languageIds: [3, 4],
    });
    expect(data).toEqual({ genreIds: [2, 1], languageIds: [4, 3] });
    expect(connection.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      { id: 7 },
      expect.anything(),
    );
    expect(connection.executeMany).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO CLIENT_GENRE_PREFERENCES'),
      [
        { clientId: 7, optionId: 1 },
        { clientId: 7, optionId: 2 },
      ],
      expect.objectContaining({ autoCommit: false }),
    );
    expect(connection.executeMany).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO CLIENT_LANGUAGE_PREFERENCES'),
      [
        { clientId: 7, optionId: 3 },
        { clientId: 7, optionId: 4 },
      ],
      expect.objectContaining({ autoCommit: false }),
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });
  it('clears both collections without checking or inserting empty options', async () => {
    selectedAccount([], []);
    await expect(
      repository.savePreferences(7, { genreIds: [], languageIds: [] }),
    ).resolves.toEqual({ genreIds: [], languageIds: [] });
    expect(connection.execute).toHaveBeenCalledTimes(3);
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM CLIENT_GENRE_PREFERENCES WHERE CLIENT_ID = :clientId',
      { clientId: 7 },
      { autoCommit: false },
    );
    expect(connection.executeMany).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, 'INACTIVE'])(
    'rejects client state %p before modifying preferences',
    async (status) => {
      connection.execute.mockResolvedValueOnce({
        rows: status ? [{ STATUS: status }] : [],
      });
      await expect(
        repository.savePreferences(7, { genreIds: [], languageIds: [] }),
      ).rejects.toMatchObject({ status: 401 });
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['genreIds', 'languageIds'])(
    'rejects unavailable %s before deleting the old selection',
    async (field) => {
      connection.execute
        .mockResolvedValueOnce({ rows: [{ STATUS: 'ACTIVE' }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(
        repository.savePreferences(7, {
          genreIds: [],
          languageIds: [],
          [field]: [99],
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(connection.execute).toHaveBeenCalledTimes(2);
      expect(connection.executeMany).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects an incomplete catalog response and binds option identifiers', async () => {
    connection.execute
      .mockResolvedValueOnce({ rows: [{ STATUS: 'ACTIVE' }] })
      .mockResolvedValueOnce({});
    await expect(
      repository.savePreferences(7, { genreIds: [12], languageIds: [] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(connection.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('IN (:option0)'),
      { option0: { val: 12, type: oracle.NUMBER } },
      expect.objectContaining({ autoCommit: false }),
    );
  });
  it('rolls back both collections when the second insertion fails', async () => {
    selectedAccount([1], [2]);
    connection.executeMany
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockRejectedValueOnce(new Error('second insert failed'));
    await expect(
      repository.savePreferences(7, { genreIds: [1], languageIds: [2] }),
    ).rejects.toThrow('second insert failed');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
  it.each([0, 2, undefined])(
    'rolls back an incomplete insertion count %p',
    async (rowsAffected) => {
      selectedAccount([1], []);
      connection.executeMany.mockResolvedValueOnce({ rowsAffected });
      await expect(
        repository.savePreferences(7, { genreIds: [1], languageIds: [] }),
      ).rejects.toThrow('complete preference selection');
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
    },
  );
  it('translates stale foreign key failures to actionable feedback', async () => {
    selectedAccount([1], []);
    connection.executeMany.mockRejectedValueOnce({ errorNum: 2291 });
    await expect(
      repository.savePreferences(7, { genreIds: [1], languageIds: [] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });
  it('propagates unexpected persistence failures for server error handling', async () => {
    connection.execute.mockRejectedValueOnce(new Error('database offline'));
    await expect(
      repository.savePreferences(7, { genreIds: [], languageIds: [] }),
    ).rejects.toThrow('database offline');
    expect(connection.commit).not.toHaveBeenCalled();
  });
  it('validates both collections before deleting either saved selection', async () => {
    connection.execute
      .mockResolvedValueOnce({ rows: [{ STATUS: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [{ GENRE_ID: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      repository.savePreferences(7, { genreIds: [1], languageIds: [99] }),
    ).rejects.toMatchObject({ status: 400 });
    expect(connection.execute).toHaveBeenCalledTimes(3);
    expect(
      connection.execute.mock.calls.some(([sql]: [string]) =>
        sql.startsWith('DELETE'),
      ),
    ).toBe(false);
    expect(connection.executeMany).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });
});
