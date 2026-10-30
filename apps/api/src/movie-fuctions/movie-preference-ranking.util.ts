import type {
  MoviePreferenceCandidate,
  MoviePreferences,
} from './entities/upcoming-movie-functions.interface';

export function rankMoviesByPreferences(
  movies: readonly MoviePreferenceCandidate[],
  preferences: MoviePreferences,
): MoviePreferenceCandidate[] {
  const genres = new Set(preferences.genreIds);
  const languages = new Set(preferences.languageIds);
  const matches = (ids: number[], preferred: Set<number>) =>
    [...new Set(ids)].filter((id) => preferred.has(id)).length;
  return movies
    .map((movie, index) => ({
      movie,
      index,
      score:
        matches(movie.genreIds, genres) + matches(movie.languageIds, languages),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.movie);
}
