import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateMovieDto } from './createMovie.dto';
import { UpdateMovieDto } from './updateMovie.dto';
describe('Movie synopsis length', () => {
  const movie = {
    title: 'Película',
    synopsis: 'Una aventura.',
    runningTime: 120,
    releaseYear: 2026,
    classificationId: 1,
    languageIds: [1],
    genreIds: [1],
  };

  it.each([
    ['title', ' '],
    ['title', 'a'.repeat(101)],
    ['title', 'á'.repeat(51)],
    ['runningTime', 0],
    ['runningTime', 1000],
    ['runningTime', 1.5],
    ['releaseYear', 1887],
    ['releaseYear', 2078],
    ['releaseYear', 2026.5],
    ['classificationId', 0],
    ['classificationId', 1.5],
    ['languageIds', []],
    ['genreIds', []],
    ['languageIds', [1, 1]],
    ['genreIds', [-1]],
    ['synopsis', ' '],
    ['synopsis', '\uD800'],
  ])(
    'rejects an invalid %s with readable Spanish feedback',
    async (field, value) => {
      const errors = await validate(
        plainToInstance(CreateMovieDto, { ...movie, [field as string]: value }),
      );
      const error = errors.find((item) => item.property === field);
      expect(error).toBeDefined();
      expect(Object.values(error?.constraints ?? {}).join(' ')).not.toMatch(
        /must|should|bytes|UTF-8|Unicode/iu,
      );
    },
  );

  it('trims required text and accepts the maximum number of Unicode synopsis characters', async () => {
    const dto = plainToInstance(CreateMovieDto, {
      ...movie,
      title: ' Película ',
      synopsis: '🎬'.repeat(1000),
    });
    expect(dto.title).toBe('Película');
    expect(await validate(dto)).toEqual([]);
  });

  it('allows partial updates and cleared associations without accepting null required fields', async () => {
    expect(
      await validate(
        plainToInstance(UpdateMovieDto, { genreIds: [], languageIds: [] }),
      ),
    ).toEqual([]);
    const errors = await validate(
      plainToInstance(UpdateMovieDto, { title: null, runningTime: null }),
    );
    expect(errors.map((error) => error.property).sort()).toEqual([
      'runningTime',
      'title',
    ]);
  });
  it.each([CreateMovieDto, UpdateMovieDto])(
    'accepts 1000 accented characters and rejects 1001 for %p',
    async (dto) => {
      const valid = {
        title: 'Película',
        runningTime: 100,
        synopsis: 'á'.repeat(1000),
        releaseYear: 2026,
        classificationId: 1,
        languageIds: [1],
        genreIds: [1],
      };
      expect(
        (await validate(plainToInstance(dto, valid))).filter(
          (error) => error.property === 'synopsis',
        ),
      ).toEqual([]);
      const errors = await validate(
        plainToInstance(dto, { ...valid, synopsis: 'á'.repeat(1001) }),
      );
      expect(
        errors.find((error) => error.property === 'synopsis')?.constraints,
      ).toEqual(
        expect.objectContaining({
          maxLength: 'La sinopsis no puede superar los 1000 caracteres.',
        }),
      );
    },
  );
});
