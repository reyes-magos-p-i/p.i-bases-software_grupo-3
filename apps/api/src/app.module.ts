import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { ImageController } from './image/image.controller';
import { MovieFuctionsModule } from './movie-fuctions/movie-fuctions.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

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
  ],
  controllers: [ImageController],
})
export class AppModule {}
