import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '../clients/clients.module';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHashingModule } from '../common/security/password-hashing.module';
import { RandomPasswordGenerator } from '../common/security/random-password-generator.service';
import { DevelopmentAdminGuard } from './guards/development-admin.guard';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { SmtpInitialCredentialsSender } from './notifications/smtp-initial-credentials-sender';
import { CreateUserValidationPipe } from './pipes/create-user-validation.pipe';
import { UsersController } from './users.controller';
import { UsersPersistenceModule } from './users-persistence.module';
import { UsersService } from './users.service';

@Module({
  imports: [
    ConfigModule,
    UsersPersistenceModule,
    PasswordHashingModule,
    ClientsModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    DevelopmentAdminGuard,
    CreateUserValidationPipe,
    { provide: PasswordGenerator, useClass: RandomPasswordGenerator },
    {
      provide: InitialCredentialsSender,
      useClass: SmtpInitialCredentialsSender,
    },
  ],
})
export class UsersModule {}
