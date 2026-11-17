// promotions.module.ts
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PromotionsController } from './promotions.controller';
import { PromotionsRepository } from './promotions.repository';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PromotionsController],
  providers: [
    PromotionsService,
    PromotionsRepository,
  ],
})
export class PromotionsModule {}
