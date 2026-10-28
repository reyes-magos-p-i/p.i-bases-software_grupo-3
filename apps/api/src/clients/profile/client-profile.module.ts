import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { UsersPersistenceModule } from '../../users/users-persistence.module';
import { ClientsModule } from '../clients.module';
import { ClientProfileController } from './client-profile.controller';
import { ClientProfileService } from './client-profile.service';
import { ClientEmailChangeController } from './client-email-change.controller';
import { ClientEmailChangeService } from './client-email-change.service';
import { ClientGuard } from './guards/client.guard';

@Module({
  imports: [AuthModule, ClientsModule, UsersPersistenceModule],
  controllers: [ClientProfileController, ClientEmailChangeController],
  providers: [ClientProfileService, ClientEmailChangeService, ClientGuard],
})
export class ClientProfileModule {}
