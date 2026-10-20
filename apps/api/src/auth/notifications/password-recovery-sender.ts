export abstract class PasswordRecoverySender {
  abstract send(message: {
    email: string;
    recoveryUrl: string;
    temporaryPassword: string;
    expiresInMinutes: number;
  }): Promise<void>;

  abstract notifyChanged(email: string): Promise<void>;
}
