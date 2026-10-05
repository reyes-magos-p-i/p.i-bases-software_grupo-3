import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { EmployeeLoginResult } from './types/employee-login-result.type';
import { EmployeeSessionService } from './employee-session.service';
import { EmployeeSessionOriginGuard } from './guards/employee-session-origin.guard';
import { ConfirmEmailVerificationDto } from './dto/confirm-email-verification.dto';
import { ResendEmailVerificationDto } from './dto/resend-email-verification.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService,
    private readonly session: EmployeeSessionService,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('confirm-email')
  @UseGuards(ThrottlerGuard)
  @Header('Cache-Control', 'no-store')
  confirmEmail(@Body() dto: ConfirmEmailVerificationDto) {
    return this.auth.confirmEmailVerification(dto.token);
  }

  @Post('resend-email-verification')
  @UseGuards(ThrottlerGuard)
  resendEmailVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.auth.resendEmailVerification(dto.email);
  }

  @Post('employees/login')
  @UseGuards(ThrottlerGuard, EmployeeSessionOriginGuard)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async loginEmployee(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Pick<EmployeeLoginResult, 'user'>> {
    const result = await this.auth.loginEmployee(dto);
    this.session.write(response, result.accessToken);
    return { user: result.user };
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: Request) {
    return req.user;
  }

  @Post('employees/logout')
  @UseGuards(EmployeeSessionOriginGuard)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  logoutEmployee(@Res({ passthrough: true }) response: Response): void {
    this.session.clear(response);
  }

  // TODO(Silvio): Google routes should be here.
  @Post('google')
  google(@Body('code') code: string) {
    //console.log(code)

    return this.auth.googleLogin(code)
  }

  // TODO(Diego): Facebook routes should be here.
  @Post('facebook')
  async facebookLogin(@Body() dto: { accessToken: string }) {
    this.logger.log(`Facebook login attempt`);
    return this.auth.facebookLogin(dto.accessToken);
  }
}
