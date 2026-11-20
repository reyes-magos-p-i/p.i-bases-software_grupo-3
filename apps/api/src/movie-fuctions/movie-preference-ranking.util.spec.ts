import {
  rankMoviesByPreferences,
  scoreMoviesForClient,
} from './movie-preference-ranking.util';
import type {
  MoviePreferenceCandidate,
  MoviePurchaseHistory,
} from './entities/upcoming-movie-functions.interface';

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

  describe('purchase-based recommendations', () => {
    const history: MoviePurchaseHistory = {
      purchasedMovieIds: [99],
      genres: [
        { id: 2, purchaseCount: 2 },
        { id: 3, purchaseCount: 1 },
      ],
      languages: [{ id: 2, purchaseCount: 3 }],
    };

    it('combines all genre and language purchase affinities with explicit preferences', () => {
      const preferences = { genreIds: [2], languageIds: [2] };
      expect(
        rankMoviesByPreferences(movies, preferences, history).map(
          ({ id }) => id,
        ),
      ).toEqual([5, 4, 2, 3, 1]);
      const scored = scoreMoviesForClient(movies, preferences, history);
      expect(scored[4]).toMatchObject({
        preferenceScore: 2,
        purchaseScore: 1.2,
        score: 3.2,
        recommended: true,
      });
      expect(scored[0]).toMatchObject({ score: 0, recommended: false });
    });

    it('uses history without requiring any explicit preferences', () => {
      expect(
        rankMoviesByPreferences(
          movies,
          { genreIds: [], languageIds: [] },
          history,
        ).map(({ id }) => id),
      ).toEqual([5, 4, 2, 3, 1]);
    });

    it('keeps bought movies in the catalog with their explicit preference score only', () => {
      const preferences = { genreIds: [2], languageIds: [2] };
      const purchases = { ...history, purchasedMovieIds: [5] };
      expect(
        scoreMoviesForClient(movies, preferences, purchases)[4],
      ).toMatchObject({
        preferenceScore: 2,
        purchaseScore: 0,
        score: 2,
        recommended: false,
      });
      expect(
        rankMoviesByPreferences(movies, preferences, purchases).map(
          ({ id }) => id,
        ),
      ).toEqual([4, 5, 2, 3, 1]);
    });

    it('ties five purchase matches with one preference and preserves the base order', () => {
      const candidates = [
        { ...movies[0], genreIds: [1], languageIds: [] },
        { ...movies[1], genreIds: [2], languageIds: [] },
      ];
      const preferences = { genreIds: [1], languageIds: [] };
      const purchases = {
        purchasedMovieIds: [99],
        genres: [{ id: 2, purchaseCount: 5 }],
        languages: [],
      };
      expect(
        rankMoviesByPreferences(candidates, preferences, purchases).map(
          ({ id }) => id,
        ),
      ).toEqual([1, 2]);
      purchases.genres[0].purchaseCount = 6;
      expect(
        rankMoviesByPreferences(candidates, preferences, purchases).map(
          ({ id }) => id,
        ),
      ).toEqual([2, 1]);
    });

    it('keeps mathematically equal mixed scores tied without rounding intermediate sums', () => {
      const candidates = [
        { ...movies[0], genreIds: [1, 3], languageIds: [] },
        { ...movies[1], genreIds: [2], languageIds: [] },
      ];
      const purchases = {
        purchasedMovieIds: [99],
        genres: [
          { id: 2, purchaseCount: 6 },
          { id: 3, purchaseCount: 1 },
        ],
        languages: [],
      };
      const preferences = { genreIds: [1], languageIds: [] };
      expect(
        scoreMoviesForClient(candidates, preferences, purchases).map(
          ({ score }) => score,
        ),
      ).toEqual([1.2, 1.2]);
      expect(
        rankMoviesByPreferences(candidates, preferences, purchases),
      ).toEqual(candidates);
    });

    it('does not multiply repeated associations or mutate the input data', () => {
      const candidates = [
        { ...movies[0], genreIds: [2, 2], languageIds: [2, 2] },
      ];
      const preferences = { genreIds: [2, 2], languageIds: [2, 2] };
      const snapshot = structuredClone({ candidates, preferences, history });
      expect(
        scoreMoviesForClient(candidates, preferences, history)[0],
      ).toMatchObject({
        preferenceScore: 2,
        purchaseScore: 1,
        score: 3,
      });
      expect({ candidates, preferences, history }).toEqual(snapshot);
    });

    it('does not attribute recommendations to empty or unrelated purchase history', () => {
      for (const purchases of [
        { purchasedMovieIds: [], genres: [], languages: [] },
        {
          purchasedMovieIds: [99],
          genres: [{ id: 99, purchaseCount: 8 }],
          languages: [{ id: 99, purchaseCount: 8 }],
        },
      ]) {
        const preferences = { genreIds: [], languageIds: [] };
        expect(rankMoviesByPreferences(movies, preferences, purchases)).toEqual(
          movies,
        );
        expect(
          scoreMoviesForClient(movies, preferences, purchases).every(
            ({ recommended }) => !recommended,
          ),
        ).toBe(true);
      }
    });
  });
});
