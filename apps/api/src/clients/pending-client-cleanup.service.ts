import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientsService } from './clients.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class PendingClientCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PendingClientCleanupService.name);
  private interval: NodeJS.Timeout | undefined;

  constructor(private readonly clients: ClientsService) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      void this.clients.deleteExpiredPendingClients().catch((error: unknown) => {
        this.logger.error(
          'Failed to delete expired pending client registrations.',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, CLEANUP_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }
}
