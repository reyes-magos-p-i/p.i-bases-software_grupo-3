import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PasswordStatusGuard } from '../auth/password/password-status.guard';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { SalesStatisticsQueryDto } from './dto/sales-statistics-query.dto';
import { SalesStatisticsService } from './sales-statistics.service';

@Controller('sales-statistics')
@UseGuards(AuthGuard('jwt'), AdministratorGuard, PasswordStatusGuard)
export class SalesStatisticsController {
  constructor(private readonly service: SalesStatisticsService) {}

  @Get()
  get(@Query() query: SalesStatisticsQueryDto) {
    return this.service.get(query);
  }
}
