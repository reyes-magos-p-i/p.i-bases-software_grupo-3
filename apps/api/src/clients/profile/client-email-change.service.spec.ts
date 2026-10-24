import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientEmailChangeService } from './client-email-change.service';
import { ClientsRepository } from '../clients.repository';
import { EmailVerificationSender } from '../../auth/notifications/email-verification-sender';

describe('ClientEmailChangeService', () => {
  const clients = {
    getEmailChangeSnapshot: jest.fn(),
    isClientEmailTaken: jest.fn(),
    confirmEmailChange: jest.fn(),
  };
  const sender = { send: jest.fn() };
  const jwt = new JwtService({ secret: 'profile-test-secret' });
  const config = {
    getOrThrow: () => 'https://cinema.example',
  } as unknown as ConfigService;
  const service = new ClientEmailChangeService(
    clients as unknown as ClientsRepository,
    jwt,
    sender as EmailVerificationSender,
    config,
  );
  const claims = {
    sub: 7,
    purpose: 'client-email-change',
    email: 'old@example.com',
    newEmail: 'new@example.com',
    sessionVersion: null,
  };
  const sign = (data: unknown = claims, options = {}) =>
    jwt.sign(data as object, {
      audience: 'client-email-change',
      expiresIn: 1800,
      ...options,
    });
  beforeEach(() => {
    jest.resetAllMocks();
    clients.getEmailChangeSnapshot.mockResolvedValue({
      email: claims.email,
      sessionVersion: null,
    });
    clients.isClientEmailTaken.mockResolvedValue(false);
  });

  it('sends a scoped short-lived fragment link without changing any client data', async () => {
    await service.request(7, claims.newEmail);
    const message = sender.send.mock.calls[0][0];
    expect(message).toMatchObject({
      email: claims.newEmail,
      purpose: 'email-change',
      expiresInMinutes: 30,
    });
    const url = new URL(message.confirmationUrl);
    expect(url.pathname).toBe('/account/confirm-email');
    expect(url.search).toBe('');
    const payload = jwt.verify(url.hash.slice(1), {
      audience: 'client-email-change',
    });
    expect(payload).toMatchObject(claims);
    expect(payload.type).toBeUndefined();
    expect(payload.exp - payload.iat).toBe(1800);
    expect(clients.confirmEmailChange).not.toHaveBeenCalled();
  });
  it('includes the exact session version after a prior reset', async () => {
    const sessionVersion = '2026-10-21T12:00:00.123456789';
    clients.getEmailChangeSnapshot.mockResolvedValue({
      email: claims.email,
      sessionVersion,
    });
    await service.request(7, claims.newEmail);
    const token = new URL(
      sender.send.mock.calls[0][0].confirmationUrl,
    ).hash.slice(1);
    await service.confirm(token);
    expect(clients.confirmEmailChange).toHaveBeenCalledWith(
      7,
      claims.email,
      claims.newEmail,
      sessionVersion,
    );
  });
  it('rejects inactive or missing accounts before sending', async () => {
    clients.getEmailChangeSnapshot.mockResolvedValue(null);
    await expect(service.request(7, claims.newEmail)).rejects.toMatchObject({
      status: 401,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });
  it('rejects unchanged email', async () => {
    await expect(service.request(7, claims.email)).rejects.toMatchObject({
      status: 400,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });
  it('rejects an email already reserved by another client', async () => {
    clients.isClientEmailTaken.mockResolvedValue(true);
    await expect(service.request(7, claims.newEmail)).rejects.toMatchObject({
      status: 409,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });
  it('reports SMTP failure without modifying the account', async () => {
    sender.send.mockRejectedValue(new Error('smtp secret'));
    await expect(service.request(7, claims.newEmail)).rejects.toMatchObject({
      status: 503,
    });
    expect(clients.confirmEmailChange).not.toHaveBeenCalled();
  });
  it('confirms a valid link without issuing a session', async () => {
    await expect(service.confirm(sign())).resolves.toEqual({ clientId: 7 });
    expect(clients.confirmEmailChange).toHaveBeenCalledWith(
      7,
      claims.email,
      claims.newEmail,
      null,
    );
  });
  it.each([
    'not-a-jwt',
    sign(claims, { expiresIn: -1 }),
    sign(claims, { audience: 'registration' }),
    sign({ ...claims, type: 'client' }),
    sign({ ...claims, purpose: 'login' }),
    sign({ ...claims, sub: 0 }),
    sign({ ...claims, sub: 1.2 }),
    sign({ ...claims, sub: '7' }),
    sign({ ...claims, email: 'invalid' }),
    sign({ ...claims, newEmail: '\uD800@example.com' }),
    sign({ ...claims, newEmail: claims.email }),
    sign({ ...claims, sessionVersion: 'bad' }),
    sign({ ...claims, sessionVersion: undefined }),
  ])('rejects malformed, expired or wrong-purpose links', async (token) => {
    await expect(service.confirm(token)).rejects.toMatchObject({ status: 400 });
    expect(clients.confirmEmailChange).not.toHaveBeenCalled();
  });
  it('rejects a forged signature', async () => {
    const token = new JwtService({ secret: 'other-secret' }).sign(claims, {
      audience: 'client-email-change',
    });
    await expect(service.confirm(token)).rejects.toMatchObject({ status: 400 });
  });
  it('propagates a transactional conflict without pretending success', async () => {
    clients.confirmEmailChange.mockRejectedValue(
      new Error('transaction failed'),
    );
    await expect(service.confirm(sign())).rejects.toThrow('transaction failed');
  });
});
