import type { CantonOption, DistrictOption, ProvinceOption } from './address'

export interface BranchOption {
  id: number
  label: string
}

export interface UserCreationOptions {
  provinces: ProvinceOption[]
  cantons: CantonOption[]
  districts: DistrictOption[]
  branches: BranchOption[]
}

export type UserRole = 'CLIENT' | 'EMPLOYEE' | 'ADMINISTRATOR'

interface CreateUserBase {
  email: string
  firstName: string
  secondName?: string | null
}

export interface CreateAddressRequest {
  districtId: number
  details?: string | null
}

export interface CreateClientRequest extends CreateUserBase {
  role: 'CLIENT'
  firstSurname?: string | null
  secondSurname?: string | null
  birthday?: string | null
  phoneNumber?: string | null
  address?: CreateAddressRequest | null
  language?: string
}

export interface CreateEmployeeRequest extends CreateUserBase {
  role: 'EMPLOYEE' | 'ADMINISTRATOR'
  firstSurname: string
  secondSurname: string
  birthday: string
  hireDate: string
  phoneNumber: string
  address: CreateAddressRequest
  branchId: number
}

export type CreateUserRequest = CreateClientRequest | CreateEmployeeRequest

export interface CreatedUser {
  id: number
  role: UserRole
  email: string
}

export interface UserApiError {
  statusCode: number
  message: string | string[]
  error?: string
}

export interface ListedClient {
  id: number
  name: string
  email: string
  phoneNumber: string | null
  createdAt: string | null
}

export interface ListedEmployee extends ListedClient {
  role: 'EMPLOYEE' | 'ADMINISTRATOR'
  branchId: number
  branchName: string
  hireDate: string | null
}

export interface UserListQuery {
  search?: string
  page: number
  pageSize: number
  sortBy: string
  sortDirection: 'asc' | 'desc'
  role?: ('EMPLOYEE' | 'ADMINISTRATOR')[]
  branchId?: number[]
}

export interface UserListResult {
  items: (ListedClient | ListedEmployee)[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface UserDetailAddress {
  id: number
  provinceId: number
  provinceName: string
  cantonId: number
  cantonName: string
  districtId: number
  districtName: string
  details: string | null
}

interface UserDetailBase {
  id: number
  firstName: string
  secondName: string | null
  firstSurname: string | null
  secondSurname: string | null
  birthday: string | null
  phoneNumber: string | null
  email: string
  address: UserDetailAddress | null
  createdAt: string | null
}

export interface ClientDetail extends UserDetailBase {
  role: 'CLIENT'
  gender: string | null
  language: string
}

export interface EmployeeDetail extends UserDetailBase {
  role: 'EMPLOYEE' | 'ADMINISTRATOR'
  branchId: number
  branchName: string
  hireDate: string | null
}

export type UserDetail = ClientDetail | EmployeeDetail

export interface UserDetailSelection {
  section: 'clients' | 'employees'
  id: number
}

export interface UpdateClientRequest {
  firstName?: string
  secondName?: string | null
  firstSurname?: string | null
  secondSurname?: string | null
  email?: string
  phoneNumber?: string | null
  address?: CreateAddressRequest | null
}

export interface UpdateEmployeeRequest {
  branchId?: number
  firstName?: string
  secondName?: string | null
  firstSurname?: string
  secondSurname?: string
  email?: string
  phoneNumber?: string
  address?: CreateAddressRequest
  role?: 'EMPLOYEE' | 'ADMINISTRATOR'
}

export type UpdateUserRequest = UpdateClientRequest | UpdateEmployeeRequest
export type UpdatedUser = CreatedUser
export type UserEditOptions = Omit<UserCreationOptions, 'branches'>

export interface UserDeactivationSelection extends UserDetailSelection {
  name: string
  displayId: string
}
