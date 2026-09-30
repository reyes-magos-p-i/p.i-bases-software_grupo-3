import type { UserRole } from './user'

export interface EmployeeIdentity {
  id: number
  firstName: string
  role: Exclude<UserRole, 'CLIENT'>
}

export interface EmployeeLoginRequest {
  email: string
  password: string
}

export type EmployeeSessionStatus = 'unknown' | 'loading' | 'authenticated' | 'anonymous' | 'error'
