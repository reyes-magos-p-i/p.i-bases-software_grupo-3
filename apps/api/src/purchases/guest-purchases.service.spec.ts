import { ClientsService } from '../clients/clients.service';
import { PurchasesService } from './purchases.service';
import { PurchasesRepository } from './purchases.repository';
import { GuestPurchasesService } from './guest-purchases.service';
import type { ConfirmGuestPurchaseDto } from './guest-purchase.dto';

describe('Guest purchase orchestration', () => {
  const clients = { findByEmail: jest.fn() },
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
    expect(repository.confirmGuest).not.toHaveBeenCalled();
  });
  it('requires login for any existing client account', async () => {
    clients.findByEmail.mockResolvedValue({ id: 8, status: 'INACTIVE' });
    await expect(service.identify(buyer)).rejects.toMatchObject({
      response: { code: 'CLIENT_LOGIN_REQUIRED' },
    });
    expect(repository.confirmGuest).not.toHaveBeenCalled();
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
  });
});
