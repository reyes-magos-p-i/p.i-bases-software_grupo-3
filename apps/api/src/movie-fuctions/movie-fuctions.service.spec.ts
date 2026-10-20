import { Test, TestingModule } from '@nestjs/testing';
import { MovieFuctionsService } from './movie-fuctions.service';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository';

describe('MovieFuctionsService', () => {
  let service: MovieFuctionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MovieFuctionsService, {
          provide: MovieFunctionsRepository,
          useValue: {
            findAll: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MovieFuctionsService>(MovieFuctionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
