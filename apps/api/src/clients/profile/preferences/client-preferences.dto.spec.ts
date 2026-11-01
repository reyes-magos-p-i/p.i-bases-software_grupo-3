import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  MAX_PREFERENCE_SELECTIONS,
  UpdateClientPreferencesDto,
} from './client-preferences.dto';

describe('Client preference validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: UpdateClientPreferencesDto,
    });
  it.each([
    { genreIds: [], languageIds: [] },
    { genreIds: [1, 2], languageIds: [3, 4] },
    { genreIds: [], languageIds: [1] },
    { genreIds: [1], languageIds: [] },
  ])('accepts multiple or empty selections %p', async (value) => {
    await expect(validate(value)).resolves.toEqual(value);
  });
  it.each(['genreIds', 'languageIds'])(
    'rejects malformed %s before persistence',
    async (field) => {
      for (const value of [
        undefined,
        null,
        '1,2',
        {},
        [0],
        [-1],
        [1.2],
        ['1'],
        [true],
        [Number.MAX_SAFE_INTEGER + 1],
        [1, 1],
        Array.from(
          { length: MAX_PREFERENCE_SELECTIONS + 1 },
          (_item, index) => index + 1,
        ),
      ]) {
        await expect(
          validate({ genreIds: [], languageIds: [], [field]: value }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    },
  );
  it.each(['clientId', 'status', 'role', 'email'])(
    'rejects unexpected field %s',
    async (field) => {
      await expect(
        validate({ genreIds: [], languageIds: [], [field]: 7 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('requires both selections explicitly', async () => {
    await expect(validate({})).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts the bounded selection size', async () => {
    const genreIds = Array.from(
      { length: MAX_PREFERENCE_SELECTIONS },
      (_item, index) => index + 1,
    );
    await expect(
      validate({ genreIds, languageIds: [] }),
    ).resolves.toMatchObject({ genreIds });
  });
});
