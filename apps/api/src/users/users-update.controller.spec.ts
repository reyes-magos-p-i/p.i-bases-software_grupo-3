import { UsersUpdateController } from './users-update.controller';
import { UsersService } from './users.service';
import { UserRole } from './enums/user-role.enum';

describe('UsersUpdateController', () => {
  const service = {
    getEditOptions: jest.fn(),
    updateClient: jest.fn(),
    updateEmployee: jest.fn(),
  };
  const controller = new UsersUpdateController(
    service as unknown as UsersService,
  );
  beforeEach(() => jest.resetAllMocks());
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
