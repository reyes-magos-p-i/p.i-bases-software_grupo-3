import {
  rankMoviesByPreferences,
  recommendMovies,
} from './movie-preference-ranking.util';
import type {
  MoviePreferences,
  OnSaleMovie,
  PortalMovie,
  PortalSection,
  PortalSectionMovie,
} from './entities/upcoming-movie-functions.interface';
import { Injectable } from '@nestjs/common';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository';

@Injectable()
export class MovieFuctionsService {
  constructor(
    private readonly movieFunctionsRepository: MovieFunctionsRepository,
  ) {}

  findAll() {
    return this.movieFunctionsRepository.getMovieFunctions();
  }

  /** SCRUM-437: the same movies for visitors and clients; recommendations are separate. */
  findSection(section: PortalSection): Promise<PortalSectionMovie[]> {
    return this.movieFunctionsRepository.getSectionMovies(section);
  }

  /**
   * SCRUM-439: Cartelera and Preventas movies ranked by the SCRUM-417 recommendation system:
   * favorite genres and languages plus purchase history. Movies without a match are left out.
   */
  async findRecommendations(
    clientId: number,
    preferences: MoviePreferences,
  ): Promise<OnSaleMovie[]> {
    const [candidates, history, movies] = await Promise.all([
      this.movieFunctionsRepository.getCatalogCandidates(),
      this.movieFunctionsRepository.getPurchaseHistory(clientId),
      this.movieFunctionsRepository.getOnSaleMovies(),
    ]);
    const cards = new Map(movies.map((movie) => [movie.id, movie]));
    return recommendMovies(candidates, preferences, history).flatMap(
      ({ id }) => cards.get(id) ?? [],
    );
  }

  async findCatalog(
    preferences?: MoviePreferences,
    clientId?: number,
  ): Promise<PortalMovie[]> {
    const movies = await this.movieFunctionsRepository.getCatalogCandidates();
    const history =
      clientId !== undefined && movies.length > 0
        ? await this.movieFunctionsRepository.getPurchaseHistory(clientId)
        : undefined;
    return rankMoviesByPreferences(
      movies,
      preferences ?? { genreIds: [], languageIds: [] },
      history,
    ).map(({ id, title, posterImage }) => ({ id, title, posterImage }));
  }
}
