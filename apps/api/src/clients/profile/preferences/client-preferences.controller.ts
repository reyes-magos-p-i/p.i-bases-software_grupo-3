import {
  Body,
  Controller,
  Get,
  Header,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { PasswordStatusGuard } from '../../../auth/password/password-status.guard';
import { EmployeeSessionOriginGuard } from '../../../auth/guards/employee-session-origin.guard';
import { ClientGuard } from '../guards/client.guard';
import { ClientPreferencesService } from './client-preferences.service';
import { UpdateClientPreferencesDto } from './client-preferences.dto';

type ClientRequest = Request & { user: { id: number } };

@Controller('clients/me/preferences')
@UseGuards(AuthGuard('jwt'), ClientGuard, PasswordStatusGuard)
export class ClientPreferencesController {
  constructor(private readonly preferences: ClientPreferencesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getSettings(@Req() request: ClientRequest) {
    return this.preferences.getSettings(request.user.id);
  }

  @Put()
  @Header('Cache-Control', 'no-store')
  @UseGuards(EmployeeSessionOriginGuard)
  save(
    @Req() request: ClientRequest,
    @Body() data: UpdateClientPreferencesDto,
  ) {
    return this.preferences.save(request.user.id, data);
  }

  @Get('portal')
  @Header('Cache-Control', 'no-store')
  getPortal(@Req() request: ClientRequest) {
    return this.preferences.getPortal(request.user.id);
  }
}
