import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { EmployeeSessionOriginGuard } from '../../auth/guards/employee-session-origin.guard';
import { ConfirmClientEmailChangeDto } from './client-email-change.dto';
import { ClientEmailChangeService } from './client-email-change.service';

@Controller('clients/email-change')
export class ClientEmailChangeController {
  constructor(private readonly email: ClientEmailChangeService) {}

  @Post('confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(EmployeeSessionOriginGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  confirm(@Body() data: ConfirmClientEmailChangeDto) {
    return this.email.confirm(data.token);
  }
}
