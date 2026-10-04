import { Test, TestingModule } from '@nestjs/testing';
import { TheaterRepository } from './theater.repository';

describe('TheaterRepository', () => {
  let provider: TheaterRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TheaterRepository],
    }).compile();

    provider = module.get<TheaterRepository>(TheaterRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
