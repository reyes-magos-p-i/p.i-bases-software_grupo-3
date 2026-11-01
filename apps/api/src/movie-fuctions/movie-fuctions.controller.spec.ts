import { MovieFuctionsController } from './movie-fuctions.controller';
import { MovieFuctionsService } from './movie-fuctions.service';

describe('MovieFuctionsController', () => {
  const service = { findAll: jest.fn(), findCatalog: jest.fn() };
  const controller = new MovieFuctionsController(
    service as unknown as MovieFuctionsService,
  );
  beforeEach(() => jest.resetAllMocks());
  it('preserves the public limited endpoint', async () => {
    service.findAll.mockResolvedValue([
      { title: 'Primera', posterImage: '1.jpg' },
    ]);
    await expect(controller.findAll()).resolves.toEqual([
      { title: 'Primera', posterImage: '1.jpg' },
    ]);
    expect(service.findAll).toHaveBeenCalledWith();
  });
  it('exposes a public complete catalog without a client identifier', async () => {
    service.findCatalog.mockResolvedValue([
      { id: 1, title: 'Primera', posterImage: '1.jpg' },
    ]);
    await expect(controller.findCatalog()).resolves.toEqual([
      { id: 1, title: 'Primera', posterImage: '1.jpg' },
    ]);
    expect(service.findCatalog).toHaveBeenCalledWith();
  });
});
