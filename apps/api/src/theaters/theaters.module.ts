import { Module } from '@nestjs/common';
import { TheatersService } from './theaters.service';
import { TheatersController } from './theaters.controller';
import { TheaterRepository } from './theater.repository/theater.repository';

@Module({
  controllers: [TheatersController],
  providers: [TheatersService, TheaterRepository],
})
export class TheatersModule {}
