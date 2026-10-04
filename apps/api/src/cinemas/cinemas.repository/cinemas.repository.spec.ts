import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { CinemasRepository } from './cinemas.repository';

describe('CinemasRepository', () => {
  let provider: CinemasRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CinemasRepository,
        { provide: DatabaseService, useValue: { query: jest.fn() } },
      ],
    }).compile();

    provider = module.get<CinemasRepository>(CinemasRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
