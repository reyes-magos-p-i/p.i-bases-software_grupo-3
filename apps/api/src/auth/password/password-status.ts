export type PasswordStatus = 'valid' | 'expired' | 'must_set';

export interface PasswordCredentialsSnapshot {
  setAt: Date | null;
  expirationDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computePasswordStatus(
  credentials: PasswordCredentialsSnapshot | null,
): PasswordStatus {
  if (!credentials) return 'must_set';
  if (![30, 60, 90, 120].includes(credentials.expirationDays)) {
    throw new Error('Invalid password credentials status.');
  }
  if (!credentials.setAt) return 'expired';
  if (
    !(credentials.setAt instanceof Date) ||
    !Number.isFinite(credentials.setAt.getTime())
  ) {
    throw new Error('Invalid password credentials status.');
  }
  const expiresAt =
    credentials.setAt.getTime() + credentials.expirationDays * MS_PER_DAY;
  return expiresAt < Date.now() ? 'expired' : 'valid';
}
