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
  Patch,
  InternalServerErrorException,
  ForbiddenException,
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
import { AllowExpiredPassword } from './password/allow-expired-password.decorator';
import { ChangeClientPasswordDto } from './dto/change-client-password.dto';
import { PasswordStatus } from './password/password-status';
import { Client } from '../clients/client.model';
import { ClientsService } from '../clients/clients.service';
import { ChangeEmployeePasswordDto } from './dto/change-employee-password.dto';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly session: EmployeeSessionService,
    private readonly clientService: ClientsService,
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

  @Post('clients/login')
  @UseGuards(ThrottlerGuard, EmployeeSessionOriginGuard)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async loginClient(@Body() dto: LoginDto) {
    return this.auth.loginClient(dto);
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

  @Post('google')
  google(@Body('code') code: string) {
    //console.log(code)

    return this.auth.googleLogin(code);
  }

  @Post('facebook')
  async facebookLogin(@Body() dto: { accessToken: string }) {
    this.logger.log(`Facebook login attempt`);
    return this.auth.facebookLogin(dto.accessToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @AllowExpiredPassword()
  @Get('password-status')
  passwordStatus(@Req() req: Request): { status: PasswordStatus } {
    if (req.passwordStatus === undefined) {
      throw new InternalServerErrorException(
        'Password status was not computed.',
      );
    }
    return { status: req.passwordStatus };
  }

  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @AllowExpiredPassword()
  @Patch('clients/password')
  async changeClientPassword(
    @Req() req: Request,
    @Body() dto: ChangeClientPasswordDto,
  ): Promise<{ message: string }> {
    if (req.accountType !== 'client') {
      throw new ForbiddenException(
        'This endpoint is only for client accounts.',
      );
    }
    const client = req.user as Client;
    await this.clientService.changePassword(
      client.id,
      client.email,
      client.firstName,
      dto,
    );
    return { message: 'Contraseña actualizada correctamente.' };
  }

  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Patch('employees/password')
  async changeEmployeePassword(
    @Req() req: Request,
    @Body() dto: ChangeEmployeePasswordDto,
  ): Promise<{ message: string }> {
    if (req.accountType !== 'employee') {
      throw new ForbiddenException(
        'This endpoint is only for employee accounts.',
      );
    }
    const employee = req.user as { id: number; role: UserRole };
    if (employee.role !== UserRole.ADMINISTRATOR) {
      throw new ForbiddenException(
        'This endpoint is only for administrator accounts.',
      );
    }
    await this.auth.changeEmployeePassword(employee.id, dto);
    return { message: 'Contraseña actualizada correctamente' };
  }
}
