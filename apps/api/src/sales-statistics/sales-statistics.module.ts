import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { SalesStatisticsController } from './sales-statistics.controller';
import { SalesStatisticsRepository } from './sales-statistics.repository';
import { SalesStatisticsService } from './sales-statistics.service';

@Module({
  imports: [AuthModule],
  controllers: [SalesStatisticsController],
  providers: [
    SalesStatisticsService,
    SalesStatisticsRepository,
    AdministratorGuard,
  ],
})
export class SalesStatisticsModule {}
