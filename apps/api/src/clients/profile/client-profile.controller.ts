import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { EmployeeSessionOriginGuard } from '../../auth/guards/employee-session-origin.guard';
import { PasswordStatusGuard } from '../../auth/password/password-status.guard';
import { ClientGuard } from './guards/client.guard';
import { ClientProfileService } from './client-profile.service';
import { ClientEmailChangeService } from './client-email-change.service';
import {
  DeactivateClientProfileDto,
  UpdateClientProfileDto,
} from './client-profile.dto';
import { RequestClientEmailChangeDto } from './client-email-change.dto';

type ClientRequest = Request & { user: { id: number } };

@Controller('clients/me')
@UseGuards(AuthGuard('jwt'), ClientGuard, PasswordStatusGuard)
export class ClientProfileController {
  constructor(
    private readonly profile: ClientProfileService,
    private readonly email: ClientEmailChangeService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getProfile(@Req() request: ClientRequest) {
    return this.profile.getProfile(request.user.id);
  }

  @Get('address-options')
  @Header('Cache-Control', 'no-store')
  getAddressOptions() {
    return this.profile.getAddressOptions();
  }

  @Patch()
  @HttpCode(204)
  @UseGuards(EmployeeSessionOriginGuard)
  update(@Req() request: ClientRequest, @Body() data: UpdateClientProfileDto) {
    return this.profile.updateProfile(request.user.id, data);
  }

  @Patch('deactivate')
  @HttpCode(204)
  @UseGuards(EmployeeSessionOriginGuard)
  deactivate(
    @Req() request: ClientRequest,
    @Body() _body: DeactivateClientProfileDto,
  ) {
    return this.profile.deactivate(request.user.id);
  }

  @Post('email-change')
  @HttpCode(202)
  @UseGuards(EmployeeSessionOriginGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  requestEmail(
    @Req() request: ClientRequest,
    @Body() data: RequestClientEmailChangeDto,
  ) {
    return this.email.request(request.user.id, data.email);
  }
}
