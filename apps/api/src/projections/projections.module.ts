import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdministratorGuard } from '../users/guards/administrator.guard';
import { ProjectionsController } from './projections.controller';
import { ProjectionsRepository } from './projections.repository';
import { ProjectionsService } from './projections.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectionsController],
  providers: [ProjectionsService, ProjectionsRepository, AdministratorGuard],
})
export class ProjectionsModule {}
