import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketsRepository } from './tickets.repository/tickets.repository';
import { AuthModule } from '../auth/auth.module';
import { ClientGuard } from '../clients/profile/guards/client.guard';
import { ClientTicketsController } from './client-tickets.controller';
import { ClientTicketsService } from './client-tickets.service';

@Module({
  imports: [AuthModule],
  controllers: [TicketsController, ClientTicketsController],
  providers: [
    TicketsService,
    TicketsRepository,
    ClientTicketsService,
    ClientGuard,
  ],
})
export class TicketsModule {}
