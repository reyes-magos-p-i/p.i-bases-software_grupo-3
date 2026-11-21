import { MovieFuctionsService } from './movie-fuctions.service';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository';

describe('MovieFuctionsService', () => {
  const repository = {
    getMovieFunctions: jest.fn(),
    getCatalogCandidates: jest.fn(),
    getPurchaseHistory: jest.fn(),
  };
  const service = new MovieFuctionsService(
    repository as unknown as MovieFunctionsRepository,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    repository.getPurchaseHistory.mockResolvedValue({
      purchasedMovieIds: [],
      genres: [],
      languages: [],
    });
  });
  it('preserves the existing limited endpoint', async () => {
    repository.getMovieFunctions.mockResolvedValue([
      { title: 'Una película', posterImage: '1.jpg' },
    ]);
    await expect(service.findAll()).resolves.toEqual([
      { title: 'Una película', posterImage: '1.jpg' },
    ]);
  });
  it('returns every eligible movie in the default chronological order without metadata', async () => {
    repository.getCatalogCandidates.mockResolvedValue(
      Array.from({ length: 6 }, (_item, index) => ({
        id: index + 1,
        title: `Movie ${index + 1}`,
        posterImage: 'poster.jpg',
        genreIds: [index],
        languageIds: [1],
      })),
    );
    const result = await service.findCatalog();
    expect(result.map((movie) => movie.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Object.keys(result[0]).sort()).toEqual([
      'id',
      'posterImage',
      'title',
    ]);
    expect(repository.getPurchaseHistory).not.toHaveBeenCalled();
  });
  it('personalizes the complete catalog rather than an already limited top four', async () => {
    repository.getCatalogCandidates.mockResolvedValue(
      Array.from({ length: 6 }, (_item, index) => ({
        id: index + 1,
        title: `Movie ${index + 1}`,
        posterImage: 'poster.jpg',
        genreIds: [index + 1],
        languageIds: [],
      })),
    );
    const result = await service.findCatalog({
      genreIds: [6],
      languageIds: [],
    });
    expect(result.map((movie) => movie.id)).toEqual([6, 1, 2, 3, 4, 5]);
  });
  it('propagates catalog errors', async () => {
    repository.getCatalogCandidates.mockRejectedValue(new Error('offline'));
    await expect(service.findCatalog()).rejects.toThrow('offline');
    expect(repository.getPurchaseHistory).not.toHaveBeenCalled();
  });

  it('recomputes authenticated rankings from fresh history without exposing personal metadata', async () => {
    repository.getCatalogCandidates.mockResolvedValue([
      {
        id: 1,
        title: 'Primera',
        posterImage: '1.jpg',
        genreIds: [1],
        languageIds: [],
      },
      {
        id: 2,
        title: 'Relacionada',
        posterImage: '2.jpg',
        genreIds: [2],
        languageIds: [],
      },
    ]);
    const preferences = { genreIds: [], languageIds: [] };
    expect(
      (await service.findCatalog(preferences, 7)).map(({ id }) => id),
    ).toEqual([1, 2]);
    repository.getPurchaseHistory.mockResolvedValue({
      purchasedMovieIds: [99],
      genres: [{ id: 2, purchaseCount: 1 }],
      languages: [],
    });
    await expect(service.findCatalog(preferences, 7)).resolves.toEqual([
      { id: 2, title: 'Relacionada', posterImage: '2.jpg' },
      { id: 1, title: 'Primera', posterImage: '1.jpg' },
    ]);
    expect(repository.getPurchaseHistory.mock.calls).toEqual([[7], [7]]);
  });

  it('does not request history when no future catalog candidates are available', async () => {
    repository.getCatalogCandidates.mockResolvedValue([]);
    await expect(service.findCatalog(undefined, 7)).resolves.toEqual([]);
    expect(repository.getPurchaseHistory).not.toHaveBeenCalled();
  });

  it('propagates history failures so the existing public fallback can be used', async () => {
    repository.getCatalogCandidates.mockResolvedValue([
      {
        id: 1,
        title: 'Película',
        posterImage: '1.jpg',
        genreIds: [],
        languageIds: [],
      },
    ]);
    repository.getPurchaseHistory.mockRejectedValue(
      new Error('history offline'),
    );
    await expect(service.findCatalog(undefined, 7)).rejects.toThrow(
      'history offline',
    );
  });
});
