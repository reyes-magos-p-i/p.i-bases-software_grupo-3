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
  /** Only for clients; employee passwords always last 30 days. */
  expirationDays?: 30 | 60 | 90 | 120
}
