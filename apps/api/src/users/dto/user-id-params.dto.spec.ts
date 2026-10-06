import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserIdParamsDto } from './user-id-params.dto';

describe('User detail ID', () => {
  it.each(['1', '42', String(Number.MAX_SAFE_INTEGER)])(
    'accepts ID %s',
    async (id) => {
      const params = plainToInstance(UserIdParamsDto, { id });
      expect(await validate(params)).toEqual([]);
      expect(params.id).toBe(Number(id));
    },
  );
  it.each([
    undefined,
    '',
    '0',
    '-1',
    '1.5',
    '1e2',
    'EMP42',
    '9007199254740992',
    '1 OR 1=1',
    ['42'],
  ])('rejects an invalid ID: %p', async (id) => {
    expect(
      await validate(plainToInstance(UserIdParamsDto, { id })),
    ).not.toEqual([]);
  });
});
