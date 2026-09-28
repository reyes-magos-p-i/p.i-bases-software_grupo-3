import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { UsersPersistenceModule } from './users-persistence.module';
import { UsersRepository } from './users.repository';

@Injectable()
class FirstConsumer {
  constructor(readonly repository: UsersRepository) {}
}

@Module({ imports: [UsersPersistenceModule], providers: [FirstConsumer] })
class FirstModule {}

@Injectable()
class SecondConsumer {
  constructor(readonly repository: UsersRepository) {}
}

@Module({ imports: [UsersPersistenceModule], providers: [SecondConsumer] })
class SecondModule {}

describe('UsersPersistenceModule', () => {
  it('shares a repository between importing modules and injects the database service', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const module = await Test.createTestingModule({
      imports: [FirstModule, SecondModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .compile();

    try {
      const first = module.get(FirstConsumer).repository;
      const second = module.get(SecondConsumer).repository;
      expect(first).toBeInstanceOf(UsersRepository);
      expect(second).toBe(first);
      await expect(
        first.findEmployeeWithLocalCredentialsByEmail('staff@example.com'),
      ).resolves.toBeNull();
      expect(db.query).toHaveBeenCalledTimes(1);
    } finally {
      await module.close();
    }
  });
});
