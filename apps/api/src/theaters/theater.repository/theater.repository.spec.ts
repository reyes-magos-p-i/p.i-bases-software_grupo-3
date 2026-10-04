import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { TheaterRepository } from './theater.repository';

describe('TheaterRepository', () => {
  let provider: TheaterRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TheaterRepository,
        { provide: DatabaseService, useValue: { query: jest.fn(), transaction: jest.fn() } },
      ],
    }).compile();

    provider = module.get<TheaterRepository>(TheaterRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
