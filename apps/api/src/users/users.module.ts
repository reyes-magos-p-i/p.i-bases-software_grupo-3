import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '../clients/clients.module';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHashingModule } from '../common/security/password-hashing.module';
import { RandomPasswordGenerator } from '../common/security/random-password-generator.service';
import { AdministratorGuard } from './guards/administrator.guard';
import { EmployeeGuard } from './guards/employee.guard';
import { AuthModule } from '../auth/auth.module';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { SmtpInitialCredentialsSender } from './notifications/smtp-initial-credentials-sender';
import { CreateUserValidationPipe } from './pipes/create-user-validation.pipe';
import { UsersController } from './users.controller';
import { UsersListController } from './users-list.controller';
import { UsersPersistenceModule } from './users-persistence.module';
import { UsersService } from './users.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    UsersPersistenceModule,
    PasswordHashingModule,
    ClientsModule,
  ],
  controllers: [UsersController, UsersListController],
  providers: [
    UsersService,
    AdministratorGuard,
    EmployeeGuard,
    CreateUserValidationPipe,
    { provide: PasswordGenerator, useClass: RandomPasswordGenerator },
    {
      provide: InitialCredentialsSender,
      useClass: SmtpInitialCredentialsSender,
    },
  ],
})
export class UsersModule {}
