import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PasswordGenerator } from './password-generator';

@Injectable()
export class RandomPasswordGenerator extends PasswordGenerator {
  generate(): string {
    return randomBytes(24).toString('base64url');
  }
}
