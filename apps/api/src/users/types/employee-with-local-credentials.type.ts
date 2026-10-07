import type { UserRole } from '../enums/user-role.enum';
import type { UserIdentity } from './user-identity.type';

export interface EmployeeWithLocalCredentials extends UserIdentity {
  role: UserRole.EMPLOYEE | UserRole.ADMINISTRATOR;
  email: string;
  firstName: string;
  secondName: string | null;
  firstSurname: string;
  secondSurname: string;
  passwordHash: string;
}
