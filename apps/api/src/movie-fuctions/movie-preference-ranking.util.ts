import type {
  MoviePreferenceCandidate,
  MoviePreferences,
  MoviePurchaseHistory,
  MovieRecommendation,
} from './entities/upcoming-movie-functions.interface';

// Integer units keep one explicit preference tied with five purchase matches.
const SCORE_UNITS = { preference: 5, purchase: 1, perPoint: 5 } as const;

export function scoreMoviesForClient(
  movies: readonly MoviePreferenceCandidate[],
  preferences: MoviePreferences,
  history?: MoviePurchaseHistory,
): MovieRecommendation[] {
  const genres = new Set(preferences.genreIds);
  const languages = new Set(preferences.languageIds);
  const purchased = new Set(history?.purchasedMovieIds);
  const genrePurchases = new Map(
    history?.genres.map(({ id, purchaseCount }) => [id, purchaseCount]),
  );
  const languagePurchases = new Map(
    history?.languages.map(({ id, purchaseCount }) => [id, purchaseCount]),
  );
  const matches = (ids: number[], preferred: Set<number>) =>
    [...new Set(ids)].filter((id) => preferred.has(id)).length;
  const purchases = (ids: number[], counts: Map<number, number>) =>
    [...new Set(ids)].reduce((total, id) => total + (counts.get(id) ?? 0), 0);
  return movies.map((movie) => {
    const preferenceUnits =
      (matches(movie.genreIds, genres) +
        matches(movie.languageIds, languages)) *
      SCORE_UNITS.preference;
    const purchaseUnits = purchased.has(movie.id)
      ? 0
      : (purchases(movie.genreIds, genrePurchases) +
          purchases(movie.languageIds, languagePurchases)) *
        SCORE_UNITS.purchase;
    return {
      movie,
      preferenceScore: preferenceUnits / SCORE_UNITS.perPoint,
      purchaseScore: purchaseUnits / SCORE_UNITS.perPoint,
      score: (preferenceUnits + purchaseUnits) / SCORE_UNITS.perPoint,
      recommended: purchaseUnits > 0,
    };
  });
}

// Highest score first; ties keep the given order (the next showtime).
function rankRecommendations(
  movies: readonly MoviePreferenceCandidate[],
  preferences: MoviePreferences,
  history?: MoviePurchaseHistory,
): MovieRecommendation[] {
  return scoreMoviesForClient(movies, preferences, history)
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export function rankMoviesByPreferences(
  movies: readonly MoviePreferenceCandidate[],
  preferences: MoviePreferences,
  history?: MoviePurchaseHistory,
): MoviePreferenceCandidate[] {
  return rankRecommendations(movies, preferences, history).map(
    (item) => item.movie,
  );
}

/**
 * SCRUM-439: the ranked movies that match the client's preferences or purchase history, for
 * "Recomendaciones para ti". Movies without any match are left out.
 */
export function recommendMovies(
  movies: readonly MoviePreferenceCandidate[],
  preferences: MoviePreferences,
  history?: MoviePurchaseHistory,
): MoviePreferenceCandidate[] {
  return rankRecommendations(movies, preferences, history)
    .filter((item) => item.score > 0)
    .map((item) => item.movie);
}
