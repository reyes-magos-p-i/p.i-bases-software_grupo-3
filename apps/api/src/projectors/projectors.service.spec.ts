import { Test, TestingModule } from '@nestjs/testing';
import { ProjectorsService } from './projectors.service';

describe('ProjectorsService', () => {
  let service: ProjectorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProjectorsService],
    }).compile();

    service = module.get<ProjectorsService>(ProjectorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
