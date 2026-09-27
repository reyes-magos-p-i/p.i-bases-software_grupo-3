import { Test, TestingModule } from '@nestjs/testing';
import { MovieFunctionsRepository } from './movie-functions.repository';

describe('MovieFunctionsRepository', () => {
  let provider: MovieFunctionsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MovieFunctionsRepository],
    }).compile();

    provider = module.get<MovieFunctionsRepository>(MovieFunctionsRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
