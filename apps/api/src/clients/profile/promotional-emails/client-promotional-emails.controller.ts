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
import { SessionOriginGuard } from '../../../auth/guards/session-origin.guard';
import { ClientGuard } from '../guards/client.guard';
import { UpdateClientPromotionalEmailsDto } from './client-promotional-emails.dto';
import { ClientPromotionalEmailsService } from './client-promotional-emails.service';

type ClientRequest = Request & { user: { id: number } };

@Controller('clients/me/promotional-emails')
@UseGuards(AuthGuard('jwt'), ClientGuard, PasswordStatusGuard)
export class ClientPromotionalEmailsController {
  constructor(
    private readonly promotionalEmails: ClientPromotionalEmailsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getSetting(@Req() request: ClientRequest) {
    return this.promotionalEmails.getSetting(request.user.id);
  }

  @Put()
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionOriginGuard)
  save(
    @Req() request: ClientRequest,
    @Body() data: UpdateClientPromotionalEmailsDto,
  ) {
    return this.promotionalEmails.save(request.user.id, data);
  }
}
