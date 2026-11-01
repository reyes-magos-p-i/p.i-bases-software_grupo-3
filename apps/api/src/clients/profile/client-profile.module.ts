import { MoviesModule } from '../../movies/movies.module';
import { MovieFuctionsModule } from '../../movie-fuctions/movie-fuctions.module';
import { ClientPreferencesController } from './preferences/client-preferences.controller';
import { ClientPreferencesRepository } from './preferences/client-preferences.repository';
import { ClientPreferencesService } from './preferences/client-preferences.service';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { UsersPersistenceModule } from '../../users/users-persistence.module';
import { ClientsModule } from '../clients.module';
import { ClientProfileController } from './client-profile.controller';
import { ClientProfileService } from './client-profile.service';
import { ClientEmailChangeController } from './client-email-change.controller';
import { ClientEmailChangeService } from './client-email-change.service';
import { ClientGuard } from './guards/client.guard';

@Module({
  imports: [
    AuthModule,
    ClientsModule,
    UsersPersistenceModule,
    MoviesModule,
    MovieFuctionsModule,
  ],
  controllers: [
    ClientProfileController,
    ClientEmailChangeController,
    ClientPreferencesController,
  ],
  providers: [
    ClientProfileService,
    ClientEmailChangeService,
    ClientGuard,
    ClientPreferencesService,
    ClientPreferencesRepository,
  ],
})
export class ClientProfileModule {}
