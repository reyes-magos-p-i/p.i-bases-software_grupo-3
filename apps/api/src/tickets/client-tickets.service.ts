import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TicketsRepository } from './tickets.repository/tickets.repository';
import { TicketsService } from './tickets.service';
import { UpdateTicketDto } from './dto/update-ticket.dto';

export const REFUND_ESTIMATE = '5 a 10 días hábiles';

@Injectable()
export class ClientTicketsService {
  constructor(
    private readonly ticketsRepository: TicketsRepository,
    private readonly ticketsService: TicketsService,
  ) {}

  async findTicket(clientId: number, ticketId: number) {
    const ticket = await this.ownedTicket(clientId, ticketId);
    const alternatives =
      ticket.functionStatus === 'CANCELLED'
        ? await this.ticketsRepository.getAlternativeShowtimesByTicketId(
            ticketId,
          )
        : [];
    return { ticket, alternatives };
  }

  async changeShowtime(
    clientId: number,
    ticketId: number,
    dto: UpdateTicketDto,
  ) {
    await this.cancelledTicket(clientId, ticketId);
    return this.ticketsService.updateMovieFunction(ticketId, dto);
  }

  async requestRefund(clientId: number, ticketId: number) {
    await this.cancelledTicket(clientId, ticketId);
    await this.ticketsRepository.requestRefund(ticketId);
    return {
      ticketId,
      status: 'REQUESTED',
      estimatedDays: REFUND_ESTIMATE,
    };
  }

  private async cancelledTicket(clientId: number, ticketId: number) {
    const ticket = await this.ownedTicket(clientId, ticketId);
    if (ticket.functionStatus !== 'CANCELLED')
      throw new BadRequestException(
        'La proyección de este boleto no está cancelada.',
      );
    return ticket;
  }

  // Missing and foreign tickets get the same answer, so ids cannot be probed.
  private async ownedTicket(clientId: number, ticketId: number) {
    const ticket = await this.ticketsRepository.findClientTicket(
      ticketId,
      clientId,
    );
    if (!ticket)
      throw new NotFoundException(
        'El boleto no existe o no pertenece a tu cuenta.',
      );
    return ticket;
  }
}
