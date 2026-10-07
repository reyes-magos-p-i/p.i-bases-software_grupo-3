import { ConflictException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import { ProjectionsRepository } from './projections.repository';
import type { NewProjections } from './types/projection.types';

type Execute = jest.Mock<Promise<unknown>, [string, Record<string, unknown>?, unknown?]>;

describe('ProjectionsRepository', () => {
  const connection: { execute: Execute } = { execute: jest.fn() };
  const db = {
    query: jest.fn(),
    transaction: jest.fn((work: (conn: typeof connection) => Promise<unknown>) =>
      work(connection),
    ),
  };
  const repository = new ProjectionsRepository(db as unknown as DatabaseService);
  const data: NewProjections = {
    movieId: 3,
    theaterId: 7,
    price: 4500,
    status: 'ACTIVE',
    cleaningMinutes: 30,
    advertisementMinutes: 15,
    slots: [
      { screeningDate: '2099-07-21', startTime: '2099-07-21T21:00', endTime: '2099-07-22T01:55' },
      { screeningDate: '2099-07-22', startTime: '2099-07-22T21:00', endTime: '2099-07-23T01:55' },
    ],
  };
  let nextId: number;

  // Answers each statement of the scheduling transaction; overrides replace
  // the answer of the first statement whose SQL contains the given key.
  function respond(overrides: Record<string, unknown> = {}) {
    connection.execute.mockImplementation((sql) => {
      const override = Object.keys(overrides).find((key) => sql.includes(key));
      if (override) return Promise.resolve(overrides[override]);
      if (sql.includes('FROM THEATERS')) return Promise.resolve({ rows: [{ BRANCH_ID: 2 }] });
      if (sql.includes('FROM CINEMA_MOVIES')) return Promise.resolve({ rows: [{ 1: 1 }] });
      if (sql.includes('FROM MOVIE_FUNCTIONS mf')) return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT ACTIVITY_ID'))
        return Promise.resolve({ rows: [{ ACTIVITY_ID: sql.length }] });
      if (sql.includes('INSERT INTO MOVIE_FUNCTIONS\n'))
        return Promise.resolve({ outBinds: { id: [nextId++] } });
      return Promise.resolve({ rowsAffected: 1 });
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    nextId = 100;
    respond();
  });

  it('maps the scheduling options', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ BRANCH_ID: 2, NAME: 'Mall Oxígeno' }] })
      .mockResolvedValueOnce({ rows: [{ THEATER_ID: 7, BRANCH_ID: 2, NUMBER_SEATS: 80 }] });
    await expect(repository.getSchedulingOptions()).resolves.toEqual({
      cinemas: [{ branchId: 2, name: 'Mall Oxígeno' }],
      theaters: [{ theaterId: 7, branchId: 2, numberOfSeats: 80 }],
    });
    db.query.mockResolvedValue({});
    await expect(repository.getSchedulingOptions()).resolves.toEqual({
      cinemas: [],
      theaters: [],
    });
  });

  it('searches available movies of a branch with an escaped pattern', async () => {
    const movie = { movieId: 3, title: 'Spider-Man', runningTime: 190, posterImage: 'a.jpg' };
    db.query.mockResolvedValueOnce({ rows: [movie] }).mockResolvedValueOnce({});
    await expect(repository.findAvailableMovies(2, ' 50%_ ')).resolves.toEqual([movie]);
    expect(db.query.mock.calls[0][1]).toEqual({
      branchId: expect.objectContaining({ val: 2 }),
      search: expect.objectContaining({ val: String.raw`%50\%\_%` }),
    });
    await expect(repository.findAvailableMovies(2, '')).resolves.toEqual([]);
  });

  it('returns the running time only for an available movie and theater', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ RUNNING_TIME: 190 }] }).mockResolvedValueOnce({});
    await expect(repository.findAvailableMovieRunningTime(7, 3)).resolves.toBe(190);
    await expect(repository.findAvailableMovieRunningTime(7, 3)).resolves.toBeNull();
  });

  it('creates every projection with its activities in one transaction', async () => {
    await expect(repository.createProjections(data, 21)).resolves.toEqual({
      status: 'ACTIVE',
      price: 4500,
      projections: [
        { movieFunctionId: 100, startTime: '2099-07-21T21:00', endTime: '2099-07-22T01:55' },
        { movieFunctionId: 101, startTime: '2099-07-22T21:00', endTime: '2099-07-23T01:55' },
      ],
    });
    const statements = connection.execute.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toContain('FOR UPDATE');
    const conflictCall = connection.execute.mock.calls.find(([sql]) =>
      sql.includes('FROM MOVIE_FUNCTIONS mf'),
    )!;
    expect(conflictCall[0]).toContain(":end1");
    expect(conflictCall[1]).toMatchObject({
      start0: '2099-07-21T21:00',
      end1: '2099-07-23T01:55',
    });
    const merges = connection.execute.mock.calls.filter(([sql]) => sql.includes('MERGE INTO ACTIVITIES'));
    expect(merges.map(([, binds]) => binds)).toEqual([
      { type: 'ADVERTISEMENT', minutes: 15, name: 'Anuncios (15 min)' },
      { type: 'CLEANING', minutes: 30, name: 'Limpieza (30 min)' },
    ]);
    expect(
      statements.filter((sql) => sql.includes('INSERT INTO MOVIE_FUNCTIONS_ACTIVITIES')),
    ).toHaveLength(4);
  });

  it.each([
    ['an inactive theater', { 'FROM THEATERS': { rows: [] } }],
    ['a movie unavailable in the branch', { 'FROM CINEMA_MOVIES': { rows: [] } }],
  ])('rejects %s', async (_case, overrides) => {
    respond(overrides);
    await expect(repository.createProjections(data, 21)).rejects.toThrow(
      new ConflictException('La sala/película seleccionada ya no está disponible.'),
    );
    expect(connection.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('reports the first overlapping projection of the theater', async () => {
    respond({
      'FROM MOVIE_FUNCTIONS mf': {
        rows: [{ startTime: '2099-07-22T18:05', endTime: '2099-07-22T21:30' }],
      },
    });
    await expect(repository.createProjections(data, 21)).rejects.toThrow(
      new ConflictException(
        'La sala ya tiene una proyección asignada en ese horario (22/07/2099 18:05 – 21:30).',
      ),
    );
  });

  it('maps a unique constraint violation to a schedule conflict', async () => {
    db.transaction.mockRejectedValueOnce(Object.assign(new Error('ORA-00001'), { errorNum: 1 }));
    await expect(repository.createProjections(data, 21)).rejects.toThrow(
      new ConflictException('La sala ya tiene una proyección asignada en ese horario.'),
    );
    const failure = new Error('offline');
    db.transaction.mockRejectedValueOnce(failure);
    await expect(repository.createProjections(data, 21)).rejects.toBe(failure);
  });
});
