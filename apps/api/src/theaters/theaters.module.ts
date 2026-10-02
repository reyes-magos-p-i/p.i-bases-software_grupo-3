import { Module } from '@nestjs/common';
import { TheatersService } from './theaters.service';
import { TheatersController } from './theaters.controller';

@Module({
  controllers: [TheatersController],
  providers: [TheatersService],
})
export class TheatersModule {}
