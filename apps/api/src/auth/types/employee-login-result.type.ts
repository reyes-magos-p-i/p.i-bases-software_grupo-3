import type { EmployeeWithLocalCredentials } from '../../users/types/employee-with-local-credentials.type';

export interface EmployeeLoginResult {
  accessToken: string;
  user: Pick<
    EmployeeWithLocalCredentials,
    | 'id'
    | 'role'
    | 'email'
    | 'firstName'
    | 'secondName'
    | 'firstSurname'
    | 'secondSurname'
  >;
}
