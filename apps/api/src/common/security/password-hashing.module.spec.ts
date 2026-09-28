import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Argon2PasswordHasher } from './argon2-password-hasher.service';
import { PasswordHasher } from './password-hasher';
import { PasswordHashingModule } from './password-hashing.module';

@Injectable()
class PasswordHashingConsumer {
  constructor(readonly passwordHasher: PasswordHasher) {}
}

describe('PasswordHashingModule', () => {
  it('injects the Argon2 implementation into a service in an importing module', async () => {
    const module = await Test.createTestingModule({
      imports: [PasswordHashingModule],
      providers: [PasswordHashingConsumer],
    }).compile();

    try {
      const consumer = module.get(PasswordHashingConsumer);

      expect(consumer.passwordHasher).toBeInstanceOf(Argon2PasswordHasher);
    } finally {
      await module.close();
    }
  });
});
