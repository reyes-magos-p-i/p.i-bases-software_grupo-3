import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // TODO(Alejandro): POST /auth/login (clients & employees)

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  me(@Req() req: Request) {
    return req.user;
  }

  // TODO(Silvio): Google routes should be here.
  @Post('google')
  google(@Body('code') code: string) {
    console.log(code)

  /*return {
    success: true,
    message: 'Backend received the Google code!'
  };*/
    return this.auth.googleLogin(code)
  }

  // TODO(Diego): Facebook routes should be here.
}
