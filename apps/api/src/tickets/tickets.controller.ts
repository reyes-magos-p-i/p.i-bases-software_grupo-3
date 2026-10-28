//import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EmployeeGuard } from '../users/guards/employee.guard';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { ParseDecimalIdPipe } from '../common/pipes/parse-decimal-id.pipe';
import { TicketsService } from './tickets.service';
//import { CreateTicketDto } from './dto/create-ticket.dto';
//import { UpdateTicketDto } from './dto/update-ticket.dto';

@Controller('tickets')
@UseGuards(AuthGuard('jwt'), EmployeeGuard, PasswordStatusGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}
  /*
  @Post()
  create(@Body() createTicketDto: CreateTicketDto) {
    return this.ticketsService.create(createTicketDto);
  }

  @Get()
  findAll() {
    return this.ticketsService.findAll();
  }
  */
  @Get(':id')
  findOne(@Param('id', ParseDecimalIdPipe) id: string) {
    return this.ticketsService.findOne(Number(id));
  }
  /*
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTicketDto: UpdateTicketDto) {
    return this.ticketsService.update(+id, updateTicketDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ticketsService.remove(+id);
  }
  */
}
