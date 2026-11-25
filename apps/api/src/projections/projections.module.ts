import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { ProjectionsController } from './projections.controller';
import { ProjectionsRepository } from './projections.repository';
import { ProjectionsService } from './projections.service';
import { CancelledProjectionNotifier } from './cancelled-projection-notifier';
import { CancelledProjectionEmailSender } from './notifications/cancelled-projection-email-sender';
import { SmtpCancelledProjectionEmailSender } from './notifications/smtp-cancelled-projection-email-sender';

@Module({
  imports: [AuthModule],
  controllers: [ProjectionsController],
  providers: [
    ProjectionsService,
    ProjectionsRepository,
    AdministratorGuard,
    CancelledProjectionNotifier,
    {
      provide: CancelledProjectionEmailSender,
      useClass: SmtpCancelledProjectionEmailSender,
    },
  ],
})
export class ProjectionsModule {}
