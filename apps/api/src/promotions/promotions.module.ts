// promotions.module.ts
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PromotionsController } from './promotions.controller';
import { PromotionsRepository } from './promotions.repository';
import { PromotionsService } from './promotions.service';
import { PromotionalEmailRepository } from './promotional-email/promotional-email.repository';
import { PromotionalEmailService } from './promotional-email/promotional-email.service';
import { SmtpPromotionalEmailSender } from './promotional-email/smtp-promotional-email-sender';

@Module({
  imports: [DatabaseModule],
  controllers: [PromotionsController],
  providers: [
    PromotionsService,
    PromotionsRepository,
    PromotionalEmailRepository,
    SmtpPromotionalEmailSender,
    PromotionalEmailService,
  ],
})
export class PromotionsModule {}
