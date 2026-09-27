import { Test, TestingModule } from '@nestjs/testing';
import { MovieFuctionsService } from './movie-fuctions.service';

describe('MovieFuctionsService', () => {
  let service: MovieFuctionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MovieFuctionsService],
    }).compile();

    service = module.get<MovieFuctionsService>(MovieFuctionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
