import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { ProjectorsRepository } from './projectors.repository';

describe('ProjectorsRepository', () => {
  let provider: ProjectorsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectorsRepository,
        { provide: DatabaseService, useValue: { query: jest.fn() } },
      ],
    }).compile();

    provider = module.get<ProjectorsRepository>(ProjectorsRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
