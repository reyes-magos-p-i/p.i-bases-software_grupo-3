import { Module } from '@nestjs/common';
import { ProjectorsService } from './projectors.service';
import { ProjectorsController } from './projectors.controller';
import { ProjectorsRepository } from './projectors.repository/projectors.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProjectorsController],
  providers: [ProjectorsService, ProjectorsRepository],
})
export class ProjectorsModule {}
