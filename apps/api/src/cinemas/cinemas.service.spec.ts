import { Test, TestingModule } from '@nestjs/testing';
import { CinemasService } from './cinemas.service';

describe('CinemasService', () => {
  let service: CinemasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CinemasService],
    }).compile();

    service = module.get<CinemasService>(CinemasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
