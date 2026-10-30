import { rankMoviesByPreferences } from './movie-preference-ranking.util';
import type { MoviePreferenceCandidate } from './entities/upcoming-movie-functions.interface';

describe('Movie preference ranking', () => {
  const movies: MoviePreferenceCandidate[] = [
    {
      id: 1,
      title: 'Primera función',
      posterImage: '1.jpg',
      genreIds: [1],
      languageIds: [1],
    },
    {
      id: 2,
      title: 'Dos géneros',
      posterImage: '2.jpg',
      genreIds: [2, 3],
      languageIds: [1],
    },
    {
      id: 3,
      title: 'Dos idiomas',
      posterImage: '3.jpg',
      genreIds: [1],
      languageIds: [2, 3],
    },
    {
      id: 4,
      title: 'Ambas preferencias',
      posterImage: '4.jpg',
      genreIds: [2],
      languageIds: [2],
    },
    {
      id: 5,
      title: 'Más coincidencias',
      posterImage: '5.jpg',
      genreIds: [2, 3],
      languageIds: [2],
    },
  ];
  it('prioritizes all matching genres and languages before any display limit', () => {
    const result = rankMoviesByPreferences(movies, {
      genreIds: [2, 3],
      languageIds: [2, 3],
    });
    expect(result.map((movie) => movie.id)).toEqual([5, 2, 3, 4, 1]);
    expect(result).toHaveLength(movies.length);
  });
  it.each([
    { genreIds: [], languageIds: [] },
    { genreIds: [99], languageIds: [99] },
  ])('preserves the chronological order without matches %p', (preferences) => {
    expect(rankMoviesByPreferences(movies, preferences)).toEqual(movies);
  });
  it('gives genres and languages equal weight and preserves original ties', () => {
    expect(
      rankMoviesByPreferences(movies, { genreIds: [2], languageIds: [2] }).map(
        (movie) => movie.id,
      ),
    ).toEqual([4, 5, 2, 3, 1]);
  });
  it('supports only genre preferences', () => {
    expect(
      rankMoviesByPreferences(movies, {
        genreIds: [2, 3],
        languageIds: [],
      }).map((movie) => movie.id),
    ).toEqual([2, 5, 4, 1, 3]);
  });
  it('supports only language preferences', () => {
    expect(
      rankMoviesByPreferences(movies, {
        genreIds: [],
        languageIds: [2, 3],
      }).map((movie) => movie.id),
    ).toEqual([3, 4, 5, 1, 2]);
  });
  it('does not inflate scores for duplicated IDs or mutate its inputs', () => {
    const input = [
      { ...movies[0], genreIds: [2, 2], languageIds: [] },
      { ...movies[1], genreIds: [2, 3], languageIds: [] },
    ];
    const snapshot = structuredClone(input);
    const preferences = { genreIds: [2, 2, 3], languageIds: [] };
    expect(
      rankMoviesByPreferences(input, preferences).map((movie) => movie.id),
    ).toEqual([2, 1]);
    expect(input).toEqual(snapshot);
    expect(preferences.genreIds).toEqual([2, 2, 3]);
  });
  it('supports an empty catalog', () => {
    expect(
      rankMoviesByPreferences([], { genreIds: [2], languageIds: [2] }),
    ).toEqual([]);
  });
});
