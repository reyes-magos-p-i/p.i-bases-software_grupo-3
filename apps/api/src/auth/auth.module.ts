import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientsModule } from '../clients/clients.module';
import { PasswordHashingModule } from '../common/security/password-hashing.module';
import { UsersPersistenceModule } from '../users/users-persistence.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  EmployeeSessionService,
  EMPLOYEE_SESSION_TTL_SECONDS,
} from './employee-session.service';
import { EmployeeSessionOriginGuard } from './guards/employee-session-origin.guard';

@Module({
  imports: [
    ClientsModule,
    PasswordHashingModule,
    UsersPersistenceModule,
    PassportModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5, blockDuration: 60_000 }],
      errorMessage:
        'Demasiadas solicitudes de inicio de sesión. Espere antes de intentarlo de nuevo.',
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService) => ({
        secret: c.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: EMPLOYEE_SESSION_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    EmployeeSessionService,
    EmployeeSessionOriginGuard,
  ],
  exports: [PassportModule, EmployeeSessionService, EmployeeSessionOriginGuard],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(cookieParser())
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
