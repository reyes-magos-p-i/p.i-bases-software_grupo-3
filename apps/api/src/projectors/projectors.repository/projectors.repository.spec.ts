import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { ProjectorsRepository } from './projectors.repository';

describe('ProjectorsRepository', () => {
  let repository: ProjectorsRepository;
  let databaseService: { query: jest.Mock };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectorsRepository,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    repository = module.get<ProjectorsRepository>(ProjectorsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getProjectors', () => {
    it('returns projectors mapped from database rows', async () => {
      databaseService.query.mockResolvedValue({
        rows: [
          { PROJECTOR_ID: 1, NAME: 'IMAX' },
          { PROJECTOR_ID: 2, NAME: '70mm' },
        ],
      });

      await expect(repository.getProjectors()).resolves.toEqual([
        { projectorId: 1, name: 'IMAX' },
        { projectorId: 2, name: '70mm' },
      ]);
      expect(databaseService.query).toHaveBeenCalledTimes(1);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM Projectors'),
      );
    });

    it.each([undefined, null, []])(
      'returns an empty list when database rows are %p',
      async (rows) => {
        databaseService.query.mockResolvedValue({ rows });

        await expect(repository.getProjectors()).resolves.toEqual([]);
      },
    );

    it('propagates database errors', async () => {
      const error = new Error('Database connection failed');
      databaseService.query.mockRejectedValue(error);

      await expect(repository.getProjectors()).rejects.toBe(error);
    });
  });
});
