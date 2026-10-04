import { Test, TestingModule } from '@nestjs/testing';
import { TheatersService } from './theaters.service';
import { TheaterRepository } from './theater.repository/theater.repository';

describe('TheatersService', () => {
  let service: TheatersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TheatersService,
        { provide: TheaterRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<TheatersService>(TheatersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
