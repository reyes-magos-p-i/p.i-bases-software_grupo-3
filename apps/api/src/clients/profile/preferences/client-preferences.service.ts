import { Injectable } from '@nestjs/common';
import type { PortalRecommendations } from '../../../movie-fuctions/entities/upcoming-movie-functions.interface';
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

  /** SCRUM-439: without favorite genres there is nothing to recommend, so it skips the query. */
  async getRecommendations(id: number): Promise<PortalRecommendations> {
    const { genreIds } = await this.preferences.getPreferences(id);
    if (!genreIds.length) return { genres: [], movies: [] };
    const [genres, movies] = await Promise.all([
      this.movies.findGenres(),
      this.portal.findRecommendations(id),
    ]);
    const favorite = new Set(genreIds);
    return {
      genres: genres
        .filter((genre) => favorite.has(genre.id))
        .map((genre) => genre.name),
      movies,
    };
  }

  async getPortal(id: number) {
    return this.portal.findCatalog(
      await this.preferences.getPreferences(id),
      id,
    );
  }
}
