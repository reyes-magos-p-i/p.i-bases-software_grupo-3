import { Module } from '@nestjs/common';
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
        signOptions: { expiresIn: 60 * 60 * 24 }, // 24h
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
