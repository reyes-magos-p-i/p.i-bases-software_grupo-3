import { MovieFuctionsService } from './movie-fuctions.service';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository';

describe('MovieFuctionsService', () => {
  const repository = {
    getMovieFunctions: jest.fn(),
    getCatalogCandidates: jest.fn(),
  };
  const service = new MovieFuctionsService(
    repository as unknown as MovieFunctionsRepository,
  );
  beforeEach(() => jest.resetAllMocks());
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
  });
});
