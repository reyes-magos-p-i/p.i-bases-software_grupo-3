import type { Request } from 'express';
import type { UserIdentity } from './types/user-identity.type';
import { BadRequestException } from '@nestjs/common';
import { UsersUpdateController } from './users-update.controller';
import { UsersService } from './users.service';
import { UserRole } from './enums/user-role.enum';

describe('UsersUpdateController', () => {
  const service = {
    deactivateClient: jest.fn(),
    deactivateEmployee: jest.fn(),
    getEditOptions: jest.fn(),
    updateClient: jest.fn(),
    updateEmployee: jest.fn(),
  };
  const controller = new UsersUpdateController(
    service as unknown as UsersService,
  );
  beforeEach(() => jest.resetAllMocks());
  it('deactivates the selected client without returning personal data', async () => {
    await controller.deactivateClient({ id: 42 }, {});
    expect(service.deactivateClient).toHaveBeenCalledWith(42);
  });
  it('obtains the acting administrator from the authenticated request', async () => {
    await controller.deactivateEmployee(
      { id: 42 },
      { user: { id: 21 } } as Request & { user: UserIdentity },
      undefined,
    );
    expect(service.deactivateEmployee).toHaveBeenCalledWith(42, 21);
  });
  it.each([null, [], 'invalid', { actorId: 99 }, { status: 'ACTIVE' }])(
    'rejects unsupported deactivation data %p',
    (body) => {
      expect(() => controller.deactivateClient({ id: 42 }, body)).toThrow(
        BadRequestException,
      );
      expect(service.deactivateClient).not.toHaveBeenCalled();
    },
  );
  it('delegates the selected client and partial changes', async () => {
    const data = { email: 'ana@example.com' };
    const result = { id: 42, ...data, role: UserRole.CLIENT };
    service.updateClient.mockResolvedValue(result);
    expect(await controller.updateClient({ id: 42 }, data)).toEqual(result);
    expect(service.updateClient).toHaveBeenCalledWith(42, data);
  });
  it('delegates selected staff role changes', async () => {
    const data = { role: UserRole.ADMINISTRATOR as const };
    const result = { id: 42, email: 'ana@example.com', ...data };
    service.updateEmployee.mockResolvedValue(result);
    expect(await controller.updateEmployee({ id: 42 }, data)).toEqual(result);
    expect(service.updateEmployee).toHaveBeenCalledWith(42, data);
  });
  it('returns edit catalogs', async () => {
    const catalogs = { provinces: [], cantons: [], districts: [] };
    service.getEditOptions.mockResolvedValue(catalogs);
    expect(await controller.getEditOptions()).toEqual(catalogs);
  });
});
