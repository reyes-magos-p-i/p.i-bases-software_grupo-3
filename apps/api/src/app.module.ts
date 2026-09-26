import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { MovieModule } from './movie/movie.module';
import { ImageController } from './image/image.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HealthModule,
    MovieModule,
  ],
  controllers: [ImageController],
})
export class AppModule {}