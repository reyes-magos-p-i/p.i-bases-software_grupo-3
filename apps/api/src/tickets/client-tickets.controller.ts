import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ClientGuard } from '../clients/profile/guards/client.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { ParseDecimalIdPipe } from '../common/pipes/parse-decimal-id.pipe';
import { ClientTicketsService } from './client-tickets.service';
import { UpdateTicketDto } from './dto/update-ticket.dto';

type ClientRequest = Request & { user: { id: number } };

@Controller('client-tickets')
@UseGuards(AuthGuard('jwt'), ClientGuard, PasswordStatusGuard)
export class ClientTicketsController {
  constructor(private readonly service: ClientTicketsService) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  findTicket(
    @Req() request: ClientRequest,
    @Param('id', ParseDecimalIdPipe) id: string,
  ) {
    return this.service.findTicket(request.user.id, Number(id));
  }

  @Patch(':id/showtime')
  @Header('Cache-Control', 'no-store')
  changeShowtime(
    @Req() request: ClientRequest,
    @Param('id', ParseDecimalIdPipe) id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.service.changeShowtime(request.user.id, Number(id), dto);
  }

  @Post(':id/refund')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  requestRefund(
    @Req() request: ClientRequest,
    @Param('id', ParseDecimalIdPipe) id: string,
  ) {
    return this.service.requestRefund(request.user.id, Number(id));
  }
}
