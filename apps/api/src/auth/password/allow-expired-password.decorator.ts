import { SetMetadata } from '@nestjs/common';

export const ALLOW_EXPIRED_PASSWORD_KEY = 'allowExpiredPassword';

/**
 * Marks a route as reachable even when the authenticated account's
 * password is expired or not yet set — used by the password-status
 * and change-password endpoints themselves.
 */
export const AllowExpiredPassword = () =>
  SetMetadata(ALLOW_EXPIRED_PASSWORD_KEY, true);