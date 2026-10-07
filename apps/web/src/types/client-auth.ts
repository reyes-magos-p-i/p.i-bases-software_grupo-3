export interface ClientIdentity {
  id: number
  email: string
  firstName: string
  lastName: string
}

export interface ClientLoginRequest {
  email: string
  password: string
}

export type ClientSessionStatus = 'unknown' | 'loading' | 'authenticated' | 'anonymous' | 'error'
