import { ClientPreferencesService } from './client-preferences.service';
import { ClientPreferencesRepository } from './client-preferences.repository';
import { MAX_PREFERENCE_SELECTIONS } from './client-preferences.dto';
import { MoviesRepository } from '../../../movies/movies.repository';
import { MovieFuctionsService } from '../../../movie-fuctions/movie-fuctions.service';

describe('ClientPreferencesService', () => {
  const repository = { getPreferences: jest.fn(), savePreferences: jest.fn() };
  const movies = { findGenres: jest.fn(), findLanguages: jest.fn() };
  const portal = { findCatalog: jest.fn() };
  const service = new ClientPreferencesService(
    repository as unknown as ClientPreferencesRepository,
    movies as unknown as MoviesRepository,
    portal as unknown as MovieFuctionsService,
  );
  beforeEach(() => jest.resetAllMocks());
  it('loads the current catalogs and saved preferences every time', async () => {
    repository.getPreferences.mockResolvedValue({
      genreIds: [1],
      languageIds: [],
    });
    movies.findGenres.mockResolvedValue([{ id: 1, name: 'Acción' }]);
    movies.findLanguages.mockResolvedValue([{ id: 2, name: 'Español' }]);
    await expect(service.getSettings(7)).resolves.toEqual({
      genres: [{ id: 1, name: 'Acción' }],
      languages: [{ id: 2, name: 'Español' }],
      selected: { genreIds: [1], languageIds: [] },
      maxSelections: MAX_PREFERENCE_SELECTIONS,
    });
    movies.findGenres.mockResolvedValue([
      { id: 1, name: 'Nombre actualizado' },
      { id: 3, name: 'Drama' },
    ]);
    const updated = await service.getSettings(7);
    expect(updated.genres).toHaveLength(2);
    expect(updated.genres[0].name).toBe('Nombre actualizado');
    expect(movies.findGenres).toHaveBeenCalledTimes(2);
    expect(repository.getPreferences).toHaveBeenCalledWith(7);
  });
  it('delegates replacement to a single persistence transaction', async () => {
    const selected = { genreIds: [], languageIds: [2] };
    repository.savePreferences.mockResolvedValue(selected);
    await expect(service.save(7, selected)).resolves.toEqual(selected);
    expect(repository.savePreferences).toHaveBeenCalledWith(7, selected);
  });
  it('uses persisted preferences for portal ordering', async () => {
    const preferences = { genreIds: [2, 3], languageIds: [4] };
    repository.getPreferences.mockResolvedValue(preferences);
    portal.findCatalog.mockResolvedValue([
      { id: 9, title: 'Preferida', posterImage: '9.jpg' },
    ]);
    await expect(service.getPortal(7)).resolves.toEqual([
      { id: 9, title: 'Preferida', posterImage: '9.jpg' },
    ]);
    expect(portal.findCatalog).toHaveBeenCalledWith(preferences);
  });
  it('does not personalize using another source after an account read failure', async () => {
    repository.getPreferences.mockRejectedValue(new Error('session ended'));
    await expect(service.getPortal(7)).rejects.toThrow('session ended');
    expect(portal.findCatalog).not.toHaveBeenCalled();
  });
});
