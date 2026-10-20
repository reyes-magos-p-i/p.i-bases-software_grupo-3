export interface PasswordRecoveryRequest {
  email: string
  accountType: 'client' | 'employee'
}

export interface PasswordRecoveryStatus {
  accountType: PasswordRecoveryRequest['accountType']
  expiresAt: string
}

export interface ResetPasswordRequest {
  token: string
  temporaryPassword: string
  newPassword: string
  confirmNewPassword: string
  expirationDays: 30 | 60 | 90 | 120
}
