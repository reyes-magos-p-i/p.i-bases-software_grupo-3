import type { PasswordExpiry, PasswordStatus } from './password-status';

declare global {
  namespace Express {
    interface Request {
      passwordStatus?: PasswordStatus;
      passwordExpiry?: PasswordExpiry;
      accountType?: 'client' | 'employee';
    }
  }
}
