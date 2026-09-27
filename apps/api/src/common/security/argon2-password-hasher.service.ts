import { Injectable } from '@nestjs/common';
import { argon2, randomBytes } from 'node:crypto';
import { PasswordHasher, type PasswordHashResult } from './password-hasher';

const ARGON2_PARAMETERS = {
  memory: 65536,
  passes: 3,
  parallelism: 4,
  tagLength: 32,
} as const;

@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<PasswordHashResult> {
    const saltBytes = randomBytes(16);
    const derivedKey = await new Promise<Buffer>((resolve, reject) => {
      argon2(
        'argon2id',
        { ...ARGON2_PARAMETERS, message: password, nonce: saltBytes },
        (error, key) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(key);
        },
      );
    });

    const salt = saltBytes.toString('base64').replace(/=+$/, '');
    const encodedHash = derivedKey.toString('base64').replace(/=+$/, '');
    const { memory, passes, parallelism } = ARGON2_PARAMETERS;

    return {
      passwordHash: `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${salt}$${encodedHash}`,
      salt,
    };
  }
}
