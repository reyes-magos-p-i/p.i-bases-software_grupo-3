import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { HealthRepository } from './health.repository/health.repository';
import { DatabaseService } from '../database/database.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthRepository, DatabaseService],
})
export class HealthModule {}
