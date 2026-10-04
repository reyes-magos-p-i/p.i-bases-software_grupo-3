import { Test, TestingModule } from '@nestjs/testing';
import { CinemasRepository } from './cinemas.repository';

describe('CinemasRepository', () => {
  let provider: CinemasRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CinemasRepository],
    }).compile();

    provider = module.get<CinemasRepository>(CinemasRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
