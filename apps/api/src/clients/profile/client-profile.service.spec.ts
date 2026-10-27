import { ClientProfileService } from './client-profile.service';
import { ClientsRepository } from '../clients.repository';
import { UsersRepository } from '../../users/users.repository';

describe('ClientProfileService', () => {
  const clients = {
    findClientDetailById: jest.fn(),
    updateClient: jest.fn(),
    deactivateClient: jest.fn(),
  };
  const users = { getAddressOptions: jest.fn() };
  const service = new ClientProfileService(
    clients as unknown as ClientsRepository,
    users as unknown as UsersRepository,
  );
  beforeEach(() => jest.resetAllMocks());

  it('returns only the selected session account', async () => {
    const profile = { id: 7, status: 'ACTIVE', email: 'a@example.com' };
    clients.findClientDetailById.mockResolvedValue(profile);
    await expect(service.getProfile(7)).resolves.toEqual(profile);
    expect(clients.findClientDetailById).toHaveBeenCalledWith(7);
  });
  it.each([null, { status: 'INACTIVE' }])(
    'rejects missing or inactive accounts %p',
    async (profile) => {
      clients.findClientDetailById.mockResolvedValue(profile);
      await expect(service.getProfile(7)).rejects.toMatchObject({
        status: 401,
      });
    },
  );
  it('returns address catalogs without querying branches', async () => {
    users.getAddressOptions.mockResolvedValue({
      provinces: [],
      cantons: [],
      districts: [],
    });
    await expect(service.getAddressOptions()).resolves.toEqual({
      provinces: [],
      cantons: [],
      districts: [],
    });
  });
  it.each([{}, { gender: undefined }])(
    'rejects empty updates %p',
    async (data) => {
      await expect(service.updateProfile(7, data)).rejects.toMatchObject({
        status: 400,
      });
      expect(clients.updateClient).not.toHaveBeenCalled();
    },
  );
  it('allows clearing gender and delegates atomic profile changes', async () => {
    await expect(
      service.updateProfile(7, { gender: null, firstName: 'Ana' }),
    ).resolves.toBeUndefined();
    expect(clients.updateClient).toHaveBeenCalledWith(7, {
      gender: null,
      firstName: 'Ana',
    });
  });
  it('reuses lifecycle deactivation and propagates database failures', async () => {
    clients.deactivateClient.mockRejectedValue(new Error('offline'));
    await expect(service.deactivate(7)).rejects.toThrow('offline');
    expect(clients.deactivateClient).toHaveBeenCalledWith(7);
  });
});
