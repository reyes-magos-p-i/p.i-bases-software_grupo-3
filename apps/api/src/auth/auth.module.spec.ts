import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { DatabaseService } from '../database/database.service';
import { DatabaseModule } from '../database/database.module';

describe('AuthModule', () => {
  let module: TestingModule;

  beforeAll(() => {
    process.env.JWT_SECRET = 'mock-secret';
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ query: jest.fn(), transaction: jest.fn() })
      .compile();
  });

  it('wires AuthController, AuthService and ClientsService', () => {
    expect(module.get(AuthController)).toBeDefined();
    expect(module.get(AuthService)).toBeDefined();
    expect(module.get(ClientsService)).toBeDefined();
  });
});