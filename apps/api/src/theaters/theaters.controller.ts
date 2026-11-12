import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Req,
  Delete,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { TheatersService } from './theaters.service';
import { CreateTheaterDto } from './dto/create-theater.dto';
import { UpdateTheaterDto } from './dto/update-theater.dto';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { UpdateSeatsDto } from './dto/update-seats.dto';
import type { Request } from 'express';
import type { UserIdentity } from '../users/types/user-identity.type';
import { SessionOriginGuard } from '../auth/guards/session-origin.guard';
import { ConfirmationEmailDto } from '../common/validation/confirmation-email.dto';
import { requireEmailConfirmation } from '../common/security/email-confirmation';

@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
@Controller('theaters')
export class TheatersController {
  constructor(private readonly theatersService: TheatersService) {}

  private theaterId(value: string): number {
    const id = Number(value);
    if (!/^\d+$/u.test(value) || !Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException(
        'El número de sala debe ser un entero positivo.',
      );
    }
    return id;
  }

  @Post()
  create(@Body() createTheaterDto: CreateTheaterDto) {
    return this.theatersService.create(createTheaterDto);
  }

  @Get()
  findAll() {
    return this.theatersService.findAll();
  }

  @Get('statuses')
  findStatuses() {
    return this.theatersService.findStatuses();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.theatersService.findOne(this.theaterId(id));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTheaterDto: UpdateTheaterDto) {
    return this.theatersService.update(this.theaterId(id), updateTheaterDto);
  }

  @Delete(':id')
  @UseGuards(SessionOriginGuard)
  remove(
    @Param('id') id: string,
    @Body() data: ConfirmationEmailDto,
    @Req() request: Request & { user: UserIdentity },
  ) {
    const theaterId = this.theaterId(id);
    requireEmailConfirmation(data.email, request.user.email);
    return this.theatersService.remove(theaterId);
  }

  @Get(':id/seats')
  getSeats(@Param('id', ParseIntPipe) id: number) {
    return this.theatersService.getSeats(id);
  }

  @Patch(':theaterId/seats')
  updateSeats(
    @Param('theaterId', ParseIntPipe) theaterId: number,
    @Body() dto: UpdateSeatsDto,
  ) {
    return this.theatersService.updateSelected(theaterId, dto);
  }
}
