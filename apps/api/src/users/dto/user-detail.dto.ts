import type { UserRole } from '../enums/user-role.enum';

export interface UserAddressDto {
  id: number;
  provinceId: number;
  provinceName: string;
  cantonId: number;
  cantonName: string;
  districtId: number;
  districtName: string;
  details: string | null;
}

interface UserDetailBaseDto {
  id: number;
  firstName: string;
  secondName: string | null;
  firstSurname: string | null;
  secondSurname: string | null;
  birthday: string | null;
  phoneNumber: string | null;
  email: string;
  address: UserAddressDto | null;
  createdAt: string | null;
}

export interface ClientDetailDto extends UserDetailBaseDto {
  role: UserRole.CLIENT;
  gender: string | null;
  language: string;
}

export interface EmployeeDetailDto extends UserDetailBaseDto {
  role: UserRole.EMPLOYEE | UserRole.ADMINISTRATOR;
  branchId: number;
  branchName: string;
  hireDate: string | null;
}
