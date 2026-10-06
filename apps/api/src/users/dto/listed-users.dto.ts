import type { UserRole } from '../enums/user-role.enum';

export interface ListedClientDto {
  id: number;
  name: string;
  email: string;
  phoneNumber: string | null;
  createdAt: string | null;
}

export interface ListedEmployeeDto extends ListedClientDto {
  role: UserRole.EMPLOYEE | UserRole.ADMINISTRATOR;
  branchId: number;
  branchName: string;
  hireDate: string | null;
}

export interface ListedUsersDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface EmployeeListOptionsDto {
  branches: { id: number; label: string }[];
}
