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
