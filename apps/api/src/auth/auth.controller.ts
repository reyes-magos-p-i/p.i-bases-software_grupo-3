import { Logger, Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { EmployeeLoginResult } from './types/employee-login-result.type';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('employees/login')
  @HttpCode(HttpStatus.OK)
  loginEmployee(@Body() dto: LoginDto): Promise<EmployeeLoginResult> {
    return this.auth.loginEmployee(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: Request) {
    return req.user;
  }

  // TODO(Silvio): Google routes should be here.
  // TODO(Diego): Facebook routes should be here.
  @Post('facebook')
  async facebookLogin(@Body() dto: { accessToken: string }) {
    this.logger.log(`Facebook login attempt`);
    return this.auth.facebookLogin(dto.accessToken);
  }
}
