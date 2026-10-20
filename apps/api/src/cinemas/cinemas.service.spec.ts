import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CinemasService } from './cinemas.service';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';

describe('CinemasService', () => {
  let service: CinemasService;
  const repository = {
    getAllCinemas: jest.fn(),
    listCinemas: jest.fn(),
    listCompanies: jest.fn(),
    findCinemaById: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CinemasService,
        { provide: CinemasRepository, useValue: repository },
      ],
    }).compile();
    service = module.get<CinemasService>(CinemasService);
  });

  it('keeps returning every branch for the other sections', async () => {
    repository.getAllCinemas.mockResolvedValue([{ branchId: 1 }]);
    await expect(service.findAll()).resolves.toEqual([{ branchId: 1 }]);
  });

  it('delegates the branch list and the company options', async () => {
    const query = { page: 1, pageSize: 10 as const, search: 'Heredia' };
    repository.listCinemas.mockResolvedValue({ items: [] });
    repository.listCompanies.mockResolvedValue([{ id: 1, name: 'Cinetadel' }]);

    await expect(service.listCinemas(query)).resolves.toEqual({ items: [] });
    await expect(service.listCompanies()).resolves.toEqual([
      { id: 1, name: 'Cinetadel' },
    ]);
    expect(repository.listCinemas).toHaveBeenCalledWith(query);
  });

  it('returns the detail of an existing branch', async () => {
    const branch = { id: 1, name: 'Sucursal Heredia Centro', status: 'ACTIVE' };
    repository.findCinemaById.mockResolvedValue(branch);
    await expect(service.getCinema(1)).resolves.toBe(branch);
    expect(repository.findCinemaById).toHaveBeenCalledWith(1);
  });

  it('answers 404 when the branch does not exist', async () => {
    repository.findCinemaById.mockResolvedValue(null);
    const failure = service.getCinema(99);
    await expect(failure).rejects.toBeInstanceOf(NotFoundException);
    await expect(failure).rejects.toThrow(
      'La sucursal seleccionada no existe.',
    );
  });
});
