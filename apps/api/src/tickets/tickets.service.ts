import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { TicketsRepository } from './tickets.repository/tickets.repository';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class TicketsService {
  constructor(private readonly ticketsRepository: TicketsRepository) {}

  findOne(id: number) {
    return this.ticketsRepository.getTicketById(id);
  }

  getAlternativeShowtimesByTicketId(id: number) {
    return this.ticketsRepository.getAlternativeShowtimesByTicketId(id);
  }

  async updateMovieFunction(id: number, updateTicketDto: UpdateTicketDto) {
    const alternatives =
      await this.ticketsRepository.getAlternativeShowtimesByTicketId(id);
    const target = alternatives.find(
      (alternative) =>
        alternative.movieFunctionId === updateTicketDto.movieFunctionId,
    );

    if (!target) {
      throw new BadRequestException(
        'La función seleccionada no es una alternativa disponible para este boleto.',
      );
    }

    const updatedRows = await this.ticketsRepository.updateMovieFunction(
      id,
      target.movieFunctionId,
      target.theaterId,
      target.seatRow,
      target.seatColumn,
    );

    if (updatedRows === 0) {
      throw new ConflictException(
        'El asiento ya fue ocupado en la función seleccionada.',
      );
    }

    return {
      ticketId: id,
      movieFunctionId: target.movieFunctionId,
      theaterId: target.theaterId,
      seatRow: target.seatRow,
      seatColumn: target.seatColumn,
    };
  }
}
