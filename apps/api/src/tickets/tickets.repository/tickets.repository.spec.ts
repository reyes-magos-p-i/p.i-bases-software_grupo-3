import { Test, TestingModule } from '@nestjs/testing';
import { TicketsRepository } from './tickets.repository';

describe('TicketsRepository', () => {
  let provider: TicketsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TicketsRepository],
    }).compile();

    provider = module.get<TicketsRepository>(TicketsRepository);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
