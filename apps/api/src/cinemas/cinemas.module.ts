import { Module } from '@nestjs/common';
import { CinemasService } from './cinemas.service';
import { CinemasController } from './cinemas.controller';

@Module({
  controllers: [CinemasController],
  providers: [CinemasService],
})
export class CinemasModule {}
