import { Logger } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PendingClientCleanupService } from './pending-client-cleanup.service';

describe('PendingClientCleanupService', () => {
  const clients = {
    deleteExpiredPendingClients: jest.fn(),
  } as unknown as ClientsService;
  let service: PendingClientCleanupService;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    service = new PendingClientCleanupService(clients);
  });

  afterEach(() => {
    service.onModuleDestroy();
    loggerError.mockRestore();
    jest.useRealTimers();
  });

  it('runs pending-account cleanup every hour and clears the interval on destroy', async () => {
    const cleanup = jest
      .mocked(clients.deleteExpiredPendingClients)
      .mockResolvedValue(undefined);

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(cleanup).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('logs an Error stack when cleanup fails', async () => {
    jest
      .mocked(clients.deleteExpiredPendingClients)
      .mockRejectedValue(new Error('database unavailable'));

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to delete expired pending client registrations.',
      expect.stringContaining('database unavailable'),
    );
  });

  it('logs a string representation when cleanup rejects with a non-Error value', async () => {
    jest
      .mocked(clients.deleteExpiredPendingClients)
      .mockRejectedValue('database unavailable');

    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to delete expired pending client registrations.',
      'database unavailable',
    );
  });
});
