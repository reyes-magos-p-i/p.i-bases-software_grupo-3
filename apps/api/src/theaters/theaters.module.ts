import { Module } from '@nestjs/common';
import { TheatersService } from './theaters.service';
import { TheatersController } from './theaters.controller';
import { TheaterRepository } from './theater.repository/theater.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TheatersController],
  providers: [TheatersService, TheaterRepository],
})
export class TheatersModule {}
