export abstract class EmailVerificationSender {
  abstract send(message: {
    purpose?: 'registration' | 'email-change';
    email: string;
    confirmationUrl: string;
    expiresInMinutes: number;
  }): Promise<void>;
}
