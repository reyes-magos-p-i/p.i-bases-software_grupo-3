import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DatabaseService } from '../database/database.service';
import { MOVIE_ON_SALE } from '../purchases/purchase-catalog.repository';
import { PortalSectionParamsDto } from './dto/portal-section-params.dto';
import { MovieFuctionsController } from './movie-fuctions.controller';
import { MovieFuctionsService } from './movie-fuctions.service';
import { MovieFunctionsRepository } from './movie-functions.repository/movie-functions.repository';

// SCRUM-437: Cartelera, Preventas and Estrenos, one request per section.
describe('Portal sections', () => {
  const row = {
    id: 42,
    title: 'The Odyssey',
    posterImage: '/uploads/posters/odyssey.webp',
    synopsis: 'Ulises vuelve a casa.',
    classification: 'TP',
    runningTime: 170,
    genres: 'Acción|Aventura',
    releaseDate: '2026-07-16',
    presaleStart: null,
  };

  describe('repository', () => {
    const query = jest.fn();
    const repository = new MovieFunctionsRepository({
      query,
    } as unknown as DatabaseService);
    const sqlFor = async (section: 'cartelera' | 'preventas' | 'estrenos') => {
      query.mockResolvedValueOnce({ rows: [] });
      await repository.getSectionMovies(section);
      return String(query.mock.calls.at(-1)?.[0]).replace(/\s+/g, ' ');
    };

    beforeEach(() => query.mockReset());

    it('maps a movie with its genres as a list', async () => {
      query.mockResolvedValue({ rows: [row, { ...row, id: 7, genres: null }] });

      const movies = await repository.getSectionMovies('cartelera');

      expect(movies[0]).toEqual({ ...row, genres: ['Acción', 'Aventura'] });
      expect(movies[1].genres).toEqual([]);
    });

    it('returns an empty list when the query has no rows', async () => {
      query.mockResolvedValue({});

      await expect(repository.getSectionMovies('estrenos')).resolves.toEqual(
        [],
      );
    });

    it('puts in Cartelera the released movies that sell functions', async () => {
      const sql = await sqlFor('cartelera');

      expect(sql).toContain('JOIN upcoming u ON u.movie_id = m.movie_id');
      expect(sql).toContain(
        "(m.RELEASE_DATE IS NULL OR m.RELEASE_DATE <= TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS DATE)))",
      );
      expect(sql).toContain('ORDER BY u.next_start, m.movie_id');
    });

    it('puts in Preventas the movies with an open presale that sell functions', async () => {
      const sql = await sqlFor('preventas');

      expect(sql).toContain('JOIN upcoming u ON u.movie_id = m.movie_id');
      expect(sql).toContain(
        "m.PRESALE_START <= TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS DATE)) AND m.RELEASE_DATE > TRUNC",
      );
    });

    it('puts in Estrenos the upcoming movies without an open presale, even without functions', async () => {
      const sql = await sqlFor('estrenos');

      expect(sql).not.toContain('JOIN upcoming u');
      expect(sql).toContain('m.RELEASE_DATE > TRUNC');
      expect(sql).toContain(
        "(m.PRESALE_START IS NULL OR m.PRESALE_START > TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS DATE)))",
      );
      expect(sql).toContain('cm.IS_AVAILABLE = 1');
      expect(sql).toContain('ORDER BY m.RELEASE_DATE, m.title, m.movie_id');
    });

    it('sells in Cartelera and Preventas only functions with free seats', async () => {
      for (const section of ['cartelera', 'preventas'] as const) {
        const sql = await sqlFor(section);
        expect(sql).toContain("mf.status = 'ACTIVE'");
        expect(sql).toContain("s.SEAT_STATE='libre'");
        // The same sale window that checkout enforces.
        expect(sql).toContain(`AND ${MOVIE_ON_SALE}`);
      }
    });
  });

  // SCRUM-439: Cartelera and Preventas movies with a favorite genre of the client.
  describe('recommendations', () => {
    const query = jest.fn();
    const repository = new MovieFunctionsRepository({
      query,
    } as unknown as DatabaseService);

    beforeEach(() => query.mockReset());

    it('matches the client favorite genres in Cartelera and Preventas only', async () => {
      const recommended = { ...row, section: 'cartelera', matchedGenre: 'Aventura' };
      query.mockResolvedValue({ rows: [recommended] });

      await expect(repository.getRecommendedMovies(7)).resolves.toEqual([
        { ...recommended, genres: ['Acción', 'Aventura'] },
      ]);
      const [sql, binds] = query.mock.calls[0] as [string, object];
      const text = sql.replace(/\s+/g, ' ');
      expect(binds).toEqual({ clientId: 7 });
      expect(text).toContain('WHERE p.client_id = :clientId');
      expect(text).toContain('JOIN upcoming u ON u.movie_id = m.movie_id JOIN liked l');
      expect(text).toContain('((m.RELEASE_DATE IS NULL OR m.RELEASE_DATE <=');
      expect(text).toContain(') OR (m.PRESALE_START <=');
      expect(text).toContain("THEN 'preventas' ELSE 'cartelera' END AS \"section\"");
      expect(text).toContain('ORDER BY l.matches DESC, u.next_start, m.movie_id');
    });

    it('the service asks the repository for the client', async () => {
      const getRecommendedMovies = jest.fn().mockResolvedValue([]);
      const service = new MovieFuctionsService({
        getRecommendedMovies,
      } as unknown as MovieFunctionsRepository);

      await expect(service.findRecommendations(7)).resolves.toEqual([]);
      expect(getRecommendedMovies).toHaveBeenCalledWith(7);
    });
  });

  it('the service returns the section from the repository', async () => {
    const getSectionMovies = jest.fn().mockResolvedValue([row]);
    const service = new MovieFuctionsService({
      getSectionMovies,
    } as unknown as MovieFunctionsRepository);

    await expect(service.findSection('preventas')).resolves.toEqual([row]);
    expect(getSectionMovies).toHaveBeenCalledWith('preventas');
  });

  it('the controller exposes each section', async () => {
    const findSection = jest.fn().mockResolvedValue([row]);
    const controller = new MovieFuctionsController({
      findSection,
    } as unknown as MovieFuctionsService);

    await expect(controller.findSection({ section: 'estrenos' })).resolves.toEqual(
      [row],
    );
    expect(findSection).toHaveBeenCalledWith('estrenos');
  });

  describe('section parameter', () => {
    it.each(['cartelera', 'preventas', 'estrenos'])('accepts %s', async (section) => {
      const params = plainToInstance(PortalSectionParamsDto, { section });
      await expect(validate(params)).resolves.toEqual([]);
    });

    it.each(['CARTELERA', 'recomendaciones', ''])('rejects %p', async (section) => {
      const params = plainToInstance(PortalSectionParamsDto, { section });
      const [error] = await validate(params);
      expect(error.constraints).toEqual({
        isIn: 'La sección debe ser cartelera, preventas o estrenos.',
      });
    });
  });
});
