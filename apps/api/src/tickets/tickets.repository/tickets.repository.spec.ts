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
});
