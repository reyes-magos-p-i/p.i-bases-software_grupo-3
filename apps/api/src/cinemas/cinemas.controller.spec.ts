import { Test, TestingModule } from '@nestjs/testing';
import { CinemasController } from './cinemas.controller';
import { CinemasService } from './cinemas.service';
import { EmployeeSessionOriginGuard } from '../auth/guards/employee-session-origin.guard';

describe('CinemasController', () => {
  let controller: CinemasController;
  const service = {
    findAll: jest.fn(),
    listCinemas: jest.fn(),
    listCompanies: jest.fn(),
    getCinema: jest.fn(),
    createCinema: jest.fn(),
    updateCinema: jest.fn(),
    deactivateCinema: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CinemasController],
      providers: [{ provide: CinemasService, useValue: service }],
    })
      .overrideGuard(EmployeeSessionOriginGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CinemasController>(CinemasController);
  });

  it('delegates every route to the service', async () => {
    const query = { page: 2, pageSize: 20 as const, companyId: 3 };
    service.findAll.mockResolvedValue([]);
    service.listCinemas.mockResolvedValue({ items: [] });
    service.listCompanies.mockResolvedValue([]);
    service.getCinema.mockResolvedValue({ id: 4 });

    await expect(controller.findAll()).resolves.toEqual([]);
    await expect(controller.listCinemas(query)).resolves.toEqual({
      items: [],
    });
    await expect(controller.listCompanies()).resolves.toEqual([]);
    await expect(controller.getCinema({ id: 4 })).resolves.toEqual({ id: 4 });
    expect(service.listCinemas).toHaveBeenCalledWith(query);
    expect(service.getCinema).toHaveBeenCalledWith(4);
  });

  it('creates a branch through the service', async () => {
    const data = { name: 'Sucursal Heredia Centro', companyId: 21 };
    service.createCinema.mockResolvedValue({ id: 30 });
    await expect(controller.createCinema(data)).resolves.toEqual({ id: 30 });
    expect(service.createCinema).toHaveBeenCalledWith(data);
  });

  it('modifies a branch through the service', async () => {
    const data = { name: 'Sucursal Heredia Oeste', companyId: 23 };
    service.updateCinema.mockResolvedValue({ id: 26 });
    await expect(controller.updateCinema({ id: 26 }, data)).resolves.toEqual({
      id: 26,
    });
    expect(service.updateCinema).toHaveBeenCalledWith(26, data);
  });

  it('deactivates a branch through the service', async () => {
    service.deactivateCinema.mockResolvedValue(undefined);
    await expect(
      controller.deactivateCinema({ id: 21 }),
    ).resolves.toBeUndefined();
    expect(service.deactivateCinema).toHaveBeenCalledWith(21);
  });
});
