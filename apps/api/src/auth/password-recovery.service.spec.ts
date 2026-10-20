import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PasswordRecoveryService } from './password-recovery.service';
import {
  PasswordRecoveryRepository,
  type Recovery,
} from './password-recovery.repository';
import { PasswordHasher } from '../common/security/password-hasher';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordRecoverySender } from './notifications/password-recovery-sender';

describe('PasswordRecoveryService', () => {
  const repository = {
    request: jest.fn(),
    find: jest.fn(),
    failAttempt: jest.fn(),
    complete: jest.fn(),
    invalidate: jest.fn(),
  };
  const hasher = { hash: jest.fn(), verify: jest.fn() };
  const generator = { generate: jest.fn() };
  const sender = { send: jest.fn(), notifyChanged: jest.fn() };
  const config = { getOrThrow: jest.fn() };
  const token = 'a'.repeat(64);
  const recovery: Recovery = {
    ID: 7,
    EMAIL: 'ana@example.com',
    FIRST_NAME: 'Ana',
    PASSWORD_HASH: 'old-hash',
    accountType: 'client',
    tokenHash: 'token-hash',
    temporaryHash: 'temporary-hash',
    expiresAt: new Date('2030-01-01'),
  };
  const input = {
    token,
    temporaryPassword: 'temporary',
    newPassword: 'NewSecret123!',
    confirmNewPassword: 'NewSecret123!',
    expirationDays: 90,
  };
  let service: PasswordRecoveryService;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.request.mockResolvedValue(recovery);
    repository.find.mockResolvedValue(recovery);
    repository.complete.mockResolvedValue(true);
    hasher.hash.mockResolvedValue({ passwordHash: 'new-hash', salt: 'salt' });
    hasher.verify.mockImplementation((_password: string, hash: string) =>
      Promise.resolve(hash === 'temporary-hash'),
    );
    generator.generate.mockReturnValue('temporary');
    config.getOrThrow.mockReturnValue('https://cinema.example');
    service = new PasswordRecoveryService(
      repository as unknown as PasswordRecoveryRepository,
      hasher as PasswordHasher,
      generator as PasswordGenerator,
      sender as PasswordRecoverySender,
      config as unknown as ConfigService,
    );
  });

  it.each(['client', 'employee'] as const)(
    'sends a recovery for %s with a hashed token and no credential change',
    async (accountType) => {
      const result = await service.request({
        accountType,
        email: recovery.EMAIL,
      });
      expect(result.message).toContain('Si existe una cuenta');
      const mail = sender.send.mock.calls[0][0] as {
        recoveryUrl: string;
        temporaryPassword: string;
      };
      const url = new URL(mail.recoveryUrl);
      expect(url.pathname).toBe('/recover-password');
      expect(url.search).toBe('');
      expect(url.hash).toMatch(/^#[a-f0-9]{64}$/u);
      expect(repository.request).toHaveBeenCalledWith(
        accountType,
        recovery.EMAIL,
        createHash('sha256').update(url.hash.slice(1)).digest('hex'),
        'new-hash',
      );
      expect(mail.temporaryPassword).toBe('temporary');
      expect(repository.complete).not.toHaveBeenCalled();
    },
  );

  it('returns the same response for missing, ineligible or recently requested accounts', async () => {
    const expected = await service.request({
      accountType: 'client',
      email: recovery.EMAIL,
    });
    sender.send.mockClear();
    repository.request.mockResolvedValue(null);
    await expect(
      service.request({ accountType: 'client', email: 'missing@example.com' }),
    ).resolves.toEqual(expected);
    expect(sender.send).not.toHaveBeenCalled();
    expect(hasher.hash).toHaveBeenCalledTimes(2);
  });

  it('invalidates an undelivered secret and keeps SMTP details private', async () => {
    sender.send.mockRejectedValue(new Error('private SMTP detail'));
    await expect(
      service.request({ accountType: 'client', email: recovery.EMAIL }),
    ).resolves.toHaveProperty('message');
    expect(repository.invalidate).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
  });

  it('validates a link without consuming it or exposing personal data', async () => {
    await expect(service.validate(token)).resolves.toEqual({
      accountType: 'client',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(repository.find).toHaveBeenCalledWith(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it.each(['validate', 'reset'] as const)(
    'rejects missing or expired recovery on %s',
    async (method) => {
      repository.find.mockResolvedValue(null);
      const operation =
        method === 'validate' ? service.validate(token) : service.reset(input);
      await expect(operation).rejects.toMatchObject({
        response: { code: 'RECOVERY_INVALID' },
      });
      expect(hasher.hash).not.toHaveBeenCalled();
    },
  );

  it('counts a wrong temporary password without changing credentials', async () => {
    hasher.verify.mockResolvedValue(false);
    await expect(service.reset(input)).rejects.toMatchObject({
      response: { code: 'TEMPORARY_PASSWORD_INCORRECT' },
    });
    expect(repository.failAttempt).toHaveBeenCalledWith(recovery.tokenHash);
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it.each([
    [{ confirmNewPassword: 'different' }, 'PASSWORDS_DO_NOT_MATCH'],
    [
      { newPassword: 'weak', confirmNewPassword: 'weak' },
      'PASSWORD_POLICY_VIOLATION',
    ],
  ])('rejects invalid replacement %p', async (changes, code) => {
    await expect(service.reset({ ...input, ...changes })).rejects.toMatchObject(
      { response: { code } },
    );
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password', async () => {
    hasher.verify.mockResolvedValue(true);
    await expect(service.reset(input)).rejects.toMatchObject({
      response: { code: 'NEW_PASSWORD_SAME_AS_CURRENT' },
    });
  });

  it('hashes and commits the new password before notifying the account', async () => {
    await expect(service.reset(input)).resolves.toHaveProperty('message');
    expect(repository.complete).toHaveBeenCalledWith(
      recovery,
      { passwordHash: 'new-hash', salt: 'salt' },
      90,
    );
    expect(sender.notifyChanged).toHaveBeenCalledWith(recovery.EMAIL);
    expect(repository.complete.mock.invocationCallOrder[0]).toBeLessThan(
      sender.notifyChanged.mock.invocationCallOrder[0],
    );
  });

  it('rejects a recovery consumed or invalidated during hashing', async () => {
    repository.complete.mockResolvedValue(false);
    await expect(service.reset(input)).rejects.toMatchObject({
      response: { code: 'RECOVERY_INVALID' },
    });
    expect(sender.notifyChanged).not.toHaveBeenCalled();
  });

  it('reports a successful reset even if the notification fails', async () => {
    sender.notifyChanged.mockRejectedValue(new Error('SMTP failure'));
    await expect(service.reset(input)).resolves.toHaveProperty('message');
    expect(repository.complete).toHaveBeenCalledTimes(1);
  });

  it('propagates persistence failures without sending a success email', async () => {
    repository.complete.mockRejectedValue(new Error('database unavailable'));
    await expect(service.reset(input)).rejects.toThrow('database unavailable');
    expect(sender.notifyChanged).not.toHaveBeenCalled();
  });
});
