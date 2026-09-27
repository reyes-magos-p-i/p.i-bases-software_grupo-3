import { Test, TestingModule } from '@nestjs/testing';
import { MovieFuctionsController } from './movie-fuctions.controller';
import { MovieFuctionsService } from './movie-fuctions.service';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository'

describe('MovieFuctionsController', () => {
  let controller: MovieFuctionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MovieFuctionsController],
      providers: [
        {
        provide: MovieFuctionsService,
        useValue: {
          findAll: jest.fn(),
        },
      },
      ],
    }).compile();

    controller = module.get<MovieFuctionsController>(MovieFuctionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
