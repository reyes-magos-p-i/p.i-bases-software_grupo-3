import { Injectable } from '@nestjs/common';
import { MoviesRepository } from '../../../movies/movies.repository';
import { MovieFuctionsService } from '../../../movie-fuctions/movie-fuctions.service';
import { ClientPreferencesRepository } from './client-preferences.repository';
import {
  MAX_PREFERENCE_SELECTIONS,
  UpdateClientPreferencesDto,
} from './client-preferences.dto';

@Injectable()
export class ClientPreferencesService {
  constructor(
    private readonly preferences: ClientPreferencesRepository,
    private readonly movies: MoviesRepository,
    private readonly portal: MovieFuctionsService,
  ) {}

  async getSettings(id: number) {
    const [selected, genres, languages] = await Promise.all([
      this.preferences.getPreferences(id),
      this.movies.findGenres(),
      this.movies.findLanguages(),
    ]);
    return {
      genres,
      languages,
      selected,
      maxSelections: MAX_PREFERENCE_SELECTIONS,
    };
  }

  save(id: number, data: UpdateClientPreferencesDto) {
    return this.preferences.savePreferences(id, data);
  }

  async getPortal(id: number) {
    return this.portal.findCatalog(await this.preferences.getPreferences(id));
  }
}
