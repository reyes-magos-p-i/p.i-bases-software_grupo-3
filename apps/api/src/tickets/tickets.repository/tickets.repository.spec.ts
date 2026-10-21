import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { TicketsRepository } from './tickets.repository';

describe('TicketsRepository', () => {
  let provider: TicketsRepository;
  let databaseService: { query: jest.Mock };

  beforeEach(async () => {
    databaseService = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsRepository,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    provider = module.get<TicketsRepository>(TicketsRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
