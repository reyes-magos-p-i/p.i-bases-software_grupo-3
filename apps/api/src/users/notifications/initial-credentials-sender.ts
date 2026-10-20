export abstract class InitialCredentialsSender {
  abstract send(credentials: {
    email: string;
    password: string;
  }): Promise<void>;
}
