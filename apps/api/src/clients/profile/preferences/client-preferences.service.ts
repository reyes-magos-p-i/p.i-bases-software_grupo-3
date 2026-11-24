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

  /**
   * SCRUM-439: Cartelera and Preventas ranked by the SCRUM-417 system, so favorite genres,
   * favorite languages and purchases all count. matchedGenre is the first favorite genre of the
   * movie by name.
   */
  async getRecommendations(id: number): Promise<PortalRecommendations> {
    const preferences = await this.preferences.getPreferences(id);
    const [genres, languages, movies] = await Promise.all([
      this.movies.findGenres(),
      this.movies.findLanguages(),
      this.portal.findRecommendations(id, preferences),
    ]);
    const names = (options: { id: number; name: string }[], ids: number[]) =>
      options.filter((option) => ids.includes(option.id)).map(({ name }) => name);
    const favoriteGenres = names(genres, preferences.genreIds);
    return {
      genres: favoriteGenres,
      languages: names(languages, preferences.languageIds),
      movies: movies.map((movie) => ({
        ...movie,
        matchedGenre:
          movie.genres.find((genre) => favoriteGenres.includes(genre)) ?? null,
      })),
    };
  }

  async getPortal(id: number) {
    return this.portal.findCatalog(
      await this.preferences.getPreferences(id),
      id,
    );
  }
}
