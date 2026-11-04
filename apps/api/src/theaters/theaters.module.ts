import { Module } from '@nestjs/common';
import { TheatersService } from './theaters.service';
import { TheatersController } from './theaters.controller';
import { TheaterRepository } from './theater.repository/theater.repository';
import { AuthModule } from '../auth/auth.module';
import { ChairsRepository } from './chairs.repository';

@Module({
  imports: [AuthModule],
  controllers: [TheatersController],
  providers: [
    TheatersService,
    TheaterRepository,
    ChairsRepository],
})
export class TheatersModule {}
