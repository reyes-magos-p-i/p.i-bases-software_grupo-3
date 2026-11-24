import { rankMoviesByPreferences } from './movie-preference-ranking.util';
import type {
  MoviePreferences,
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
