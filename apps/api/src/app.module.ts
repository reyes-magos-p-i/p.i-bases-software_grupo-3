import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { ImageController } from './image/image.controller';
import { MovieFuctionsModule } from './movie-fuctions/movie-fuctions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HealthModule,
    MovieFuctionsModule,
  ],
  controllers: [ImageController],
})
export class AppModule {}