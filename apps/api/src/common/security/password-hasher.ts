export interface PasswordHashResult {
  passwordHash: string;
  salt: string;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<PasswordHashResult>;
  abstract verify(password: string, passwordHash: string): Promise<boolean>;
}
