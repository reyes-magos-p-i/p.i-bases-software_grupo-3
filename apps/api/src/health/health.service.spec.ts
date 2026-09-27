import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { HealthRepository } from './health.repository/health.repository';

describe('HealthService', () => {
  let service: HealthService;
  let repository: HealthRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService, {
        provide: HealthRepository,
        useValue: {
          checkDatabaseConnection: jest.fn().mockResolvedValue(true),
        },
      }],
    }).compile();

    service = module.get<HealthService>(HealthService);
    repository = module.get<HealthRepository>(HealthRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(repository).toBeDefined();
  });
});
