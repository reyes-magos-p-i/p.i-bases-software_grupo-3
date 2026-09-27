import { Module } from '@nestjs/common';
import { MovieFuctionsService } from './movie-fuctions.service';
import { MovieFuctionsController } from './movie-fuctions.controller';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository';

@Module({
  controllers: [MovieFuctionsController],
  providers: [MovieFuctionsService, MovieFunctionsRepository],
})
export class MovieFuctionsModule {}
