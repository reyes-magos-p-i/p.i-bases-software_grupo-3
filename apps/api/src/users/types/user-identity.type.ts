import type { UserRole } from '../enums/user-role.enum';

export interface UserIdentity {
  id: number;
  role: UserRole;
}
