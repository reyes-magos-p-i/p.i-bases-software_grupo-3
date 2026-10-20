import type { PasswordStatus } from './password-status';

declare global {
  namespace Express {
    interface Request {
      passwordStatus?: PasswordStatus;
      accountType?: 'client' | 'employee';
    }
  }
}