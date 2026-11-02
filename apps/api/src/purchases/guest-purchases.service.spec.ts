import { ClientsService } from '../clients/clients.service';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './purchases.repository';
import { GuestPurchasesService } from './guest-purchases.service';
import type { ConfirmGuestPurchaseDto } from './guest-purchase.dto';

describe('Guest purchase orchestration', () => {
  const clients = {
      findByEmail: jest.fn(),
      deleteExpiredPendingClientByEmail: jest.fn(),
      isEmailVerificationPending: jest.fn(),
    },
    repository = { confirmGuest: jest.fn(), findGuest: jest.fn() };
  const service = new GuestPurchasesService(
    {} as PurchasesService,
    repository as unknown as PurchasesRepository,
    clients as unknown as ClientsService,
  );
  const buyer = {
    email: 'guest@example.com',
    confirmEmail: 'guest@example.com',
  };
  beforeEach(() => jest.resetAllMocks());
  it('allows an unregistered email and does not create an account', async () => {
    await expect(service.identify(buyer)).resolves.toEqual({
      email: buyer.email,
    });
    expect(clients.findByEmail).toHaveBeenCalledWith(buyer.email);
    expect(clients.deleteExpiredPendingClientByEmail).toHaveBeenCalledWith(
      buyer.email,
    );
    expect(
      clients.deleteExpiredPendingClientByEmail.mock.invocationCallOrder[0],
    ).toBeLessThan(clients.findByEmail.mock.invocationCallOrder[0]);
    expect(clients.isEmailVerificationPending).not.toHaveBeenCalled();
    expect(repository.confirmGuest).not.toHaveBeenCalled();
  });
  it('requires login for an active verified account', async () => {
    clients.findByEmail.mockResolvedValue({ id: 8, status: 'ACTIVE' });
    clients.isEmailVerificationPending.mockResolvedValue(false);
    await expect(service.identify(buyer)).rejects.toMatchObject({
      response: { code: 'CLIENT_LOGIN_REQUIRED' },
    });
    expect(repository.confirmGuest).not.toHaveBeenCalled();
    expect(clients.isEmailVerificationPending).toHaveBeenCalledWith(8);
  });
  it.each([
    ['INACTIVE', false, 'CLIENT_ACCOUNT_INACTIVE', 'reactivación'],
    ['ACTIVE', true, 'CLIENT_VERIFICATION_REQUIRED', 'Confirma tu correo'],
  ])(
    'returns an actionable message for %s accounts with pending verification %s',
    async (status, pending, code, message) => {
      clients.findByEmail.mockResolvedValue({ id: 8, status });
      clients.isEmailVerificationPending.mockResolvedValue(pending);
      await expect(service.identify(buyer)).rejects.toMatchObject({
        response: { code, message: expect.stringContaining(message) },
      });
      expect(repository.confirmGuest).not.toHaveBeenCalled();
    },
  );
  it('allows guest identification after expired registration cleanup removes the account', async () => {
    clients.findByEmail.mockResolvedValue({ id: 8, status: 'ACTIVE' });
    clients.deleteExpiredPendingClientByEmail.mockImplementationOnce(() => {
      clients.findByEmail.mockResolvedValue(null);
      return Promise.resolve();
    });
    await expect(service.identify(buyer)).resolves.toEqual({
      email: buyer.email,
    });
    expect(clients.isEmailVerificationPending).not.toHaveBeenCalled();
  });
  it('does not ignore a cleanup failure or proceed with account lookup', async () => {
    clients.deleteExpiredPendingClientByEmail.mockRejectedValueOnce(
      new Error('unavailable'),
    );
    await expect(service.identify(buyer)).rejects.toThrow('unavailable');
    expect(clients.findByEmail).not.toHaveBeenCalled();
  });
  it('rejects differing confirmation before account lookup or confirmation', async () => {
    await expect(
      service.identify({ ...buyer, confirmEmail: 'other@example.com' }),
    ).rejects.toThrow('deben coincidir');
    expect(() =>
      service.confirm({
        buyer: { ...buyer, confirmEmail: '' },
      } as ConfirmGuestPurchaseDto),
    ).toThrow('deben coincidir');
    expect(clients.findByEmail).not.toHaveBeenCalled();
    expect(clients.deleteExpiredPendingClientByEmail).not.toHaveBeenCalled();
    expect(repository.confirmGuest).not.toHaveBeenCalled();
  });
  it('delegates atomic confirmation and secure lookup without granting a client identity', async () => {
    const data = { buyer } as ConfirmGuestPurchaseDto;
    repository.confirmGuest.mockResolvedValue({
      id: 12,
      accessCode: 'private',
    });
    repository.findGuest.mockResolvedValue({ id: 12 });
    await expect(service.confirm(data)).resolves.toEqual({
      id: 12,
      accessCode: 'private',
    });
    expect(repository.confirmGuest).toHaveBeenCalledWith(buyer.email, data);
    await expect(service.lookup('private')).resolves.toEqual({ id: 12 });
    expect(repository.findGuest).toHaveBeenCalledWith('private');
    expect(clients.deleteExpiredPendingClientByEmail).not.toHaveBeenCalled();
    expect(clients.findByEmail).not.toHaveBeenCalled();
  });
});
