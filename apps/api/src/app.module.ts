import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { ImageController } from './image/image.controller';
import { MovieFuctionsModule } from './movie-fuctions/movie-fuctions.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TheatersModule } from './theaters/theaters.module';
import { CinemasModule } from './cinemas/cinemas.module';
import { ProjectorsModule } from './projectors/projectors.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    HealthModule,
    MovieFuctionsModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    TheatersModule,
    CinemasModule,
    ProjectorsModule,
  ],
  controllers: [ImageController],
})
export class AppModule {}
