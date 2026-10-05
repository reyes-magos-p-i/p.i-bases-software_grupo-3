import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsRepository } from './clients.repository';
import { PendingClientCleanupService } from './pending-client-cleanup.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [ClientsService, ClientsRepository, PendingClientCleanupService],
  exports: [ClientsService, ClientsRepository],
})
export class ClientsModule {}
