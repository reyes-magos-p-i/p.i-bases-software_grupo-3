import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { CinemasRepository } from './cinemas.repository';

describe('CinemasRepository', () => {
  let repository: CinemasRepository;
  let databaseService: { query: jest.Mock };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CinemasRepository,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    repository = module.get<CinemasRepository>(CinemasRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getAllCinemas', () => {
    it('returns cinemas mapped from database rows', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          { BRANCH_ID: 2, NAME: 'Mall San Pedro', COMPANY_ID: 1 },
          { BRANCH_ID: 5, NAME: 'Multiplaza Escazú', COMPANY_ID: 10 },
        ],
      });

      await expect(repository.getAllCinemas()).resolves.toEqual([
        { branchId: 2, name: 'Mall San Pedro', companyId: 1 },
        { branchId: 5, name: 'Multiplaza Escazú', companyId: 10 },
      ]);
      expect(databaseService.query).toHaveBeenCalledTimes(1);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Cinemas'),
      );
    });

    it.each([undefined, null, []])(
      'returns an empty list when database rows are %p',
      async (rows) => {
        databaseService.query.mockResolvedValue({ rows });

        await expect(repository.getAllCinemas()).resolves.toEqual([]);
      },
    );

    it('propagates database errors', async () => {
      const error = new Error('Database connection failed');
      databaseService.query.mockRejectedValue(error);

      await expect(repository.getAllCinemas()).rejects.toBe(error);
    });
  });
});
