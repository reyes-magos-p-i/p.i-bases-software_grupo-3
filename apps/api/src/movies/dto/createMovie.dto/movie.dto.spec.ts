import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateMovieDto } from './createMovie.dto';
import { UpdateMovieDto } from './updateMovie.dto';
describe('Movie synopsis length', () => {
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
