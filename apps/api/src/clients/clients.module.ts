import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsRepository } from './clients.repository';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [ClientsService, ClientsRepository],
  exports: [ClientsService, ClientsRepository],
})
export class ClientsModule {}
