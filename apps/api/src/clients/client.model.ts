export type Provider = 'GOOGLE' | 'FACEBOOK';

export interface Client {
  id: number;
  email: string;
  firstName: string;
  secondName: string | null;
  firstSurname: string | null;
  secondSurname: string | null;
  birthday: string | null;
  phoneNumber: string | null;
  gender: string | null;
  language: string;
}

export interface ClientWithPassword extends Client {
  passwordHash: string;
}

export interface NewClient {
  email: string;
  firstName: string;
  secondName?: string | null;
  firstSurname?: string | null;
  secondSurname?: string | null;
  birthday?: string | null; // 'YYYY-MM-DD'
  phoneNumber?: string | null;
  gender?: string | null;
  language?: string;
  acceptedTerms?: boolean;
}

export interface SocialProfile {
  provider: Provider;
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
}