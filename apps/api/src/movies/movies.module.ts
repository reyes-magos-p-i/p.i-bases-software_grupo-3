import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { MoviesRepository } from './movies.repository';

@Module({
  controllers: [MoviesController],
  providers: [MoviesService, MoviesRepository]
})
export class MoviesModule {}
