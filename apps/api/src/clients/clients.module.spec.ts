import { Test, TestingModule } from '@nestjs/testing';
import { ClientsModule } from './clients.module';
import { ClientsService } from './clients.service';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';

describe('ClientsModule', () => {
  it('wires ClientsService', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule, ClientsModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ query: jest.fn(), transaction: jest.fn() })
      .compile();

    expect(module.get(ClientsService)).toBeDefined();
  });
});