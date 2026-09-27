import { Module } from '@nestjs/common';
import { MovieFuctionsService } from './movie-fuctions.service';
import { MovieFuctionsController } from './movie-fuctions.controller';

@Module({
  controllers: [MovieFuctionsController],
  providers: [MovieFuctionsService],
})
export class MovieFuctionsModule {}
