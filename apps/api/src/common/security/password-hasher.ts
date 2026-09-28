export interface PasswordHashResult {
  passwordHash: string;
  salt: string;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<PasswordHashResult>;
}
