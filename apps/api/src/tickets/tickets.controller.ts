import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmployeeGuard } from '../users/guards/employee.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { ParseDecimalIdPipe } from '../common/pipes/parse-decimal-id.pipe';
import { TicketsService } from './tickets.service';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Controller('tickets')
@UseGuards(AuthGuard('jwt'), EmployeeGuard, PasswordStatusGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}
  @Get(':id')
  findOne(@Param('id', ParseDecimalIdPipe) id: string) {
    return this.ticketsService.findOne(Number(id));
  }

  @Get(':id/alternative-showtimes')
  getAlternativeShowtimesByTicketId(
    @Param('id', ParseDecimalIdPipe) id: string,
  ) {
    return this.ticketsService.getAlternativeShowtimesByTicketId(Number(id));
  }

  @Patch(':id')
  updateMovieFunction(
    @Param('id', ParseDecimalIdPipe) id: string,
    @Body() updateTicketDto: UpdateTicketDto,
  ) {
    return this.ticketsService.updateMovieFunction(Number(id), updateTicketDto);
  }
}
