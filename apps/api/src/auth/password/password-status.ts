export type PasswordStatus = 'valid' | 'expired' | 'must_set';

export interface PasswordCredentialsSnapshot {
  setAt: Date | null;
  expirationDays: number;
}

export interface PasswordExpiry {
  status: PasswordStatus;
  /** Configured period, or null when the account has no local password. */
  expirationDays: number | null;
  /** Days left, rounded up, only inside the warning window; otherwise null. */
  expiresInDays: number | null;
}

/** Period of a new client's password; clients may later pick 30, 60, 90 or 120. */
export const DEFAULT_PASSWORD_EXPIRATION_DAYS = 30;
/** Fixed period of every employee password; employees cannot choose another. */
export const EMPLOYEE_PASSWORD_EXPIRATION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** The expiry warning starts 72 hours before the password expires. */
export const PASSWORD_EXPIRY_WARNING_MS = 3 * MS_PER_DAY;

function expiresAtMs(credentials: PasswordCredentialsSnapshot): number | null {
  if (![30, 60, 90, 120].includes(credentials.expirationDays)) {
    throw new Error('Invalid password credentials status.');
  }
  if (!credentials.setAt) return null;
  if (
    !(credentials.setAt instanceof Date) ||
    !Number.isFinite(credentials.setAt.getTime())
  ) {
    throw new TypeError('Invalid password credentials status.');
  }
  return credentials.setAt.getTime() + credentials.expirationDays * MS_PER_DAY;
}

/** A password expires exactly when its period ends (30 days = 720 hours). */
export function computePasswordStatus(
  credentials: PasswordCredentialsSnapshot | null,
  now = Date.now(),
): PasswordStatus {
  if (!credentials) return 'must_set';
  const expiresAt = expiresAtMs(credentials);
  return expiresAt === null || expiresAt <= now ? 'expired' : 'valid';
}

export function describePasswordExpiry(
  credentials: PasswordCredentialsSnapshot | null,
  now = Date.now(),
): PasswordExpiry {
  const status = computePasswordStatus(credentials, now);
  if (!credentials)
    return { status, expirationDays: null, expiresInDays: null };
  const remaining = (expiresAtMs(credentials) ?? now) - now;
  return {
    status,
    expirationDays: credentials.expirationDays,
    expiresInDays:
      status === 'valid' && remaining <= PASSWORD_EXPIRY_WARNING_MS
        ? Math.ceil(remaining / MS_PER_DAY)
        : null,
  };
}
