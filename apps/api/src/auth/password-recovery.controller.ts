import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { EmployeeSessionOriginGuard } from './guards/employee-session-origin.guard';
import { PasswordRecoveryService } from './password-recovery.service';
import { RequestPasswordRecoveryDto } from './dto/request-password-recovery.dto';
import { ValidatePasswordRecoveryDto } from './dto/validate-password-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth/password-recovery')
@UseGuards(ThrottlerGuard, EmployeeSessionOriginGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  request(@Body() input: RequestPasswordRecoveryDto) {
    return this.recovery.request(input);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  validate(@Body() input: ValidatePasswordRecoveryDto) {
    return this.recovery.validate(input.token);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  reset(@Body() input: ResetPasswordDto) {
    return this.recovery.reset(input);
  }
}
