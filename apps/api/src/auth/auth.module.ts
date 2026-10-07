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
import { EmailVerificationSender } from './notifications/email-verification-sender';
import { SmtpEmailVerificationSender } from './notifications/smtp-email-verification-sender';
import { PasswordStatusGuard } from './password/password-status.guard';

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
    {
      provide: EmailVerificationSender,
      useClass: SmtpEmailVerificationSender,
    },
    JwtStrategy,
    EmployeeSessionService,
    EmployeeSessionOriginGuard,
    PasswordStatusGuard,
  ],
  exports: [
    PassportModule,
    EmployeeSessionService,
    EmployeeSessionOriginGuard,
    PasswordStatusGuard,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(cookieParser())
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
