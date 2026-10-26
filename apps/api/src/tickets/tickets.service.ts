import { Injectable } from '@nestjs/common';
import { TicketsRepository } from './tickets.repository/tickets.repository';
//import { CreateTicketDto } from './dto/create-ticket.dto';
//import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class TicketsService {
  constructor(private readonly ticketsRepository: TicketsRepository) {}
  /*
  create(createTicketDto: CreateTicketDto) {
    return 'This action adds a new ticket';
  }

  findAll() {
    return `This action returns all tickets`;
  }
  */
  findOne(id: number) {
    return this.ticketsRepository.getTicketById(id);
  }
  /*
  update(id: number, updateTicketDto: UpdateTicketDto) {
    return `This action updates a #${id} ticket`;
  }

  remove(id: number) {
    return `This action removes a #${id} ticket`;
  }
  */
}
