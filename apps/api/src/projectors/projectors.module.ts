import { Module } from '@nestjs/common';
import { ProjectorsService } from './projectors.service';
import { ProjectorsController } from './projectors.controller';

@Module({
  controllers: [ProjectorsController],
  providers: [ProjectorsService],
})
export class ProjectorsModule {}
