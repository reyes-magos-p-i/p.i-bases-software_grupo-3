import { Test, TestingModule } from '@nestjs/testing';
import { ProjectorsService } from './projectors.service';
import { ProjectorsRepository } from './projectors.repository/projectors.repository';

describe('ProjectorsService', () => {
  let service: ProjectorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectorsService,
        { provide: ProjectorsRepository, useValue: { getProjectors: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProjectorsService>(ProjectorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
