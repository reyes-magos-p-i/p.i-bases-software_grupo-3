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

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService,
    private readonly session: EmployeeSessionService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
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

  // TODO(Silvio): Google routes should be here.
  // TODO(Diego): Facebook routes should be here.
  @Post('facebook')
  async facebookLogin(@Body() dto: { accessToken: string }) {
    this.logger.log(`Facebook login attempt`);
    return this.auth.facebookLogin(dto.accessToken);
  }
}
