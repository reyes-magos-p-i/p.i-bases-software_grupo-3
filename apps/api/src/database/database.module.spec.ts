import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseModule } from './database.module';
import { DatabaseService } from './database.service';

describe('DatabaseModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [DatabaseModule],
    })
      // Override DatabaseService with a mock to avoid real DB connections during testing
      .overrideProvider(DatabaseService)
      .useValue({
        query: jest.fn(),
        transaction: jest.fn(),
      })
      .compile();
  });

  it('should be defined and compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should export and resolve DatabaseService', () => {
    const service = module.get<DatabaseService>(DatabaseService);
    expect(service).toBeDefined();
  });
});