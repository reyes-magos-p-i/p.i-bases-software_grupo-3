export type PasswordStatus = 'valid' | 'expired' | 'must_set';

export interface PasswordCredentialsSnapshot {
  setAt: Date;
  expirationDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computePasswordStatus(
  credentials: PasswordCredentialsSnapshot | null,
): PasswordStatus {
  if (!credentials) return 'must_set';
  const expiresAt = credentials.setAt.getTime() + credentials.expirationDays * MS_PER_DAY;
  return expiresAt < Date.now() ? 'expired' : 'valid';
}