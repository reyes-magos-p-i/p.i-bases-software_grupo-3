import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import oracledb from 'oracledb';
import { DatabaseService } from '../../database/database.service';
import { TicketsRepository } from './tickets.repository';

describe('TicketsRepository', () => {
  let repository: TicketsRepository;
  let databaseService: { query: jest.Mock };

  const row = {
    TITLE: 'Interstellar',
    THEATER_ID: 3,
    START_TIME: '2026/10/21 18:30',
    END_TIME: '2026/10/21 21:19',
    SEAT: '4-7',
  };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsRepository,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    repository = module.get<TicketsRepository>(TicketsRepository);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getTicketById', () => {
    it('returns the ticket mapped from the database row', async () => {
      databaseService.query.mockResolvedValue({ rows: [row] });

      await expect(repository.getTicketById(1)).resolves.toEqual({
        title: 'Interstellar',
        theaterId: 3,
        startTime: '2026/10/21 18:30',
        endTime: '2026/10/21 21:19',
        seat: '4-7',
      });
    });

    it('queries by ticket id using object output format', async () => {
      databaseService.query.mockResolvedValue({ rows: [row] });

      await repository.getTicketById(42);

      expect(databaseService.query).toHaveBeenCalledTimes(1);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE t.tickets_id = :id'),
        { id: 42 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
    });

    it('returns only the first row when the query returns several', async () => {
      databaseService.query.mockResolvedValue({
        rows: [row, { ...row, SEAT: '9-9', THEATER_ID: 8 }],
      });

      await expect(repository.getTicketById(1)).resolves.toEqual(
        expect.objectContaining({ seat: '4-7', theaterId: 3 }),
      );
    });

    it.each([
      ['rows is empty', { rows: [] }],
      ['rows is undefined', {}],
      ['rows is null', { rows: null }],
    ])('returns null when %s', async (_label, result) => {
      databaseService.query.mockResolvedValue(result);

      await expect(repository.getTicketById(999)).resolves.toBeNull();
    });

    it('logs and rethrows database errors', async () => {
      const error = new Error('Database connection failed');
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      databaseService.query.mockRejectedValue(error);

      await expect(repository.getTicketById(1)).rejects.toBe(error);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Error fetching ticket by ID',
        error,
      );
    });
  });

  describe('getAlternativeShowtimesByTicketId', () => {
    const alternativeRow = {
      MOVIE_FUNCTION_ID: 12,
      THEATER_ID: 3,
      TIME: '18:30',
      DATE: '21 de octubre, 2026',
      SEAT_ROW: 1,
      SEAT_COLUMN: 1,
    };

    it('returns every alternative showtime mapped to camelCase', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          alternativeRow,
          {
            ...alternativeRow,
            MOVIE_FUNCTION_ID: 13,
            THEATER_ID: 4,
            TIME: '21:00',
            SEAT_ROW: 2,
            SEAT_COLUMN: 2,
          },
        ],
      });

      await expect(
        repository.getAlternativeShowtimesByTicketId(1),
      ).resolves.toEqual([
        {
          movieFunctionId: 12,
          theaterId: 3,
          time: '18:30',
          date: '21 de octubre, 2026',
          seatRow: 1,
          seatColumn: 1,
        },
        {
          movieFunctionId: 13,
          theaterId: 4,
          time: '21:00',
          date: '21 de octubre, 2026',
          seatRow: 2,
          seatColumn: 2,
        },
      ]);
    });

    it('queries by ticket id using object output format', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });

      await repository.getAlternativeShowtimesByTicketId(42);

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('t.tickets_id = :tickets_id'),
        { tickets_id: 42 },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
    });

    it.each([
      ['rows is empty', { rows: [] }],
      ['rows is undefined', {}],
      ['rows is null', { rows: null }],
    ])('returns an empty array when %s', async (_label, result) => {
      databaseService.query.mockResolvedValue(result);

      await expect(
        repository.getAlternativeShowtimesByTicketId(999),
      ).resolves.toEqual([]);
    });

    it('logs and rethrows database errors', async () => {
      const error = new Error('Database connection failed');
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      databaseService.query.mockRejectedValue(error);

      await expect(
        repository.getAlternativeShowtimesByTicketId(1),
      ).rejects.toBe(error);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Error fetching alternative showtimes by ticket ID',
        error,
      );
    });
  });

  describe('updateMovieFunction', () => {
    it('updates the movie function and seat only when the seat is free', async () => {
      databaseService.query.mockResolvedValue({ rowsAffected: 1 });

      await expect(
        repository.updateMovieFunction(7, 13, 3, 2, 2),
      ).resolves.toBe(1);

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('NOT EXISTS'),
        {
          tickets_id: 7,
          movie_function_id: 13,
          theater_id: 3,
          seat_row: 2,
          seat_column: 2,
        },
      );
    });

    it('returns 0 when the unique seat constraint rejects a concurrent update', async () => {
      databaseService.query.mockRejectedValue({
        errorNum: 1,
        message:
          'ORA-00001: unique constraint (PRODUCTION.UQ_TICKETS_FUNCTION_SEAT) violated',
      });

      await expect(
        repository.updateMovieFunction(7, 13, 3, 2, 2),
      ).resolves.toBe(0);
    });

    it('returns 0 when no row was updated', async () => {
      databaseService.query.mockResolvedValue({ rowsAffected: 0 });

      await expect(
        repository.updateMovieFunction(7, 13, 3, 2, 2),
      ).resolves.toBe(0);
    });
  });
});
