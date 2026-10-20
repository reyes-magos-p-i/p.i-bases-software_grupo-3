import { Module } from '@nestjs/common';
import { Argon2PasswordHasher } from './argon2-password-hasher.service';
import { PasswordHasher } from './password-hasher';

@Module({
  providers: [{ provide: PasswordHasher, useClass: Argon2PasswordHasher }],
  exports: [PasswordHasher],
})
export class PasswordHashingModule {}
