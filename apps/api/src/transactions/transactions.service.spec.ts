import { BadRequestException } from '@nestjs/common';
import type { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  const repository = {
    listTransactions: jest.fn(),
    listFilterOptions: jest.fn(),
  };
  const service = new TransactionsService(
    repository as unknown as TransactionsRepository,
  );
  const page = { items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };

  beforeEach(() => jest.resetAllMocks());

  it('delegates the list and the filter options', async () => {
    const query = { page: 1, pageSize: 10, dateFrom: '2026-10-05' };
    const options = { branches: [], movies: [] };
    repository.listTransactions.mockResolvedValue(page);
    repository.listFilterOptions.mockResolvedValue(options);
    await expect(service.listTransactions(query)).resolves.toBe(page);
    expect(repository.listTransactions).toHaveBeenCalledWith(query);
    await expect(service.listFilterOptions()).resolves.toBe(options);
  });

  it('accepts a one-day range', async () => {
    repository.listTransactions.mockResolvedValue(page);
    await service.listTransactions({
      page: 1,
      pageSize: 10,
      dateFrom: '2026-10-12',
      dateTo: '2026-10-12',
    });
    expect(repository.listTransactions).toHaveBeenCalled();
  });

  it('rejects a start date after the end date', () => {
    expect(() =>
      service.listTransactions({
        page: 1,
        pageSize: 10,
        dateFrom: '2026-10-16',
        dateTo: '2026-10-05',
      }),
    ).toThrow(
      new BadRequestException(
        'La fecha de inicio no puede ser posterior a la fecha de fin.',
      ),
    );
    expect(repository.listTransactions).not.toHaveBeenCalled();
  });
});
