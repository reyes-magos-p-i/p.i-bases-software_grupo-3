import { Test, TestingModule } from '@nestjs/testing';
import { CinemasService } from './cinemas.service';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';

describe('CinemasService', () => {
  let service: CinemasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CinemasService,
        { provide: CinemasRepository, useValue: { getAllCinemas: jest.fn() } },
      ],
    }).compile();

    service = module.get<CinemasService>(CinemasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
