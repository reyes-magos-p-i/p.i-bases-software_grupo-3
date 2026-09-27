import { Test, TestingModule } from '@nestjs/testing';
import { MovieFunctionsRepository } from './movie-functions.repository';
import { DatabaseService } from '../../database/database.service'

describe('MovieFunctionsRepository', () => {
  let provider: MovieFunctionsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MovieFunctionsRepository,
      {
        provide: DatabaseService,
        useValue: {
          query: jest.fn(),
        },
      },
      ],
    }).compile();

    provider = module.get<MovieFunctionsRepository>(MovieFunctionsRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
