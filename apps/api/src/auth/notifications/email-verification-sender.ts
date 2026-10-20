export abstract class EmailVerificationSender {
  abstract send(message: {
    email: string
    confirmationUrl: string
    expiresInMinutes: number
  }): Promise<void>
}
