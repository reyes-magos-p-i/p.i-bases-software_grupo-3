import { Module } from '@nestjs/common';
import { CinemasService } from './cinemas.service';
import { CinemasController } from './cinemas.controller';
import { CinemasRepository } from './cinemas.repository/cinemas.repository';

@Module({
  controllers: [CinemasController],
  providers: [CinemasService, CinemasRepository],
})
export class CinemasModule {}
