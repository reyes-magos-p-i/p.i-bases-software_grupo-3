import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CinemaIdParamsDto } from './cinema-id-params.dto';
import { ListCinemasQueryDto } from './list-cinemas-query.dto';

describe('Branch request DTOs', () => {
  const list = (payload: object) =>
    plainToInstance(ListCinemasQueryDto, payload);

  it('defaults to the first page of 10 branches', async () => {
    const query = list({});
    expect(await validate(query)).toEqual([]);
    expect(query).toEqual({ page: 1, pageSize: 10 });
  });

  it('converts query strings and normalizes the search', async () => {
    const query = list({
      search: '  Heredia   Centro ',
      companyId: '3',
      page: '2',
      pageSize: '50',
    });
    expect(await validate(query)).toEqual([]);
    expect(query).toEqual({
      search: 'Heredia Centro',
      companyId: 3,
      page: 2,
      pageSize: 50,
    });
  });

  it.each([
    { search: '   ' },
    { search: 'a\u0000b' },
    { search: 'x'.repeat(101) },
    { search: 5 },
    { companyId: '0' },
    { companyId: 'abc' },
    { companyId: '1.5' },
    { page: '0' },
    { page: '1000001' },
    { pageSize: '15' },
    { pageSize: 'ten' },
  ])('rejects %p', async (payload) => {
    expect(await validate(list(payload))).not.toEqual([]);
  });

  it('accepts a search of 100 characters', async () => {
    expect(await validate(list({ search: 'x'.repeat(100) }))).toEqual([]);
  });

  it.each([
    ['1', []],
    ['9007199254740991', []],
  ])('accepts the branch ID %p', async (id, errors) => {
    const params = plainToInstance(CinemaIdParamsDto, { id });
    expect(await validate(params)).toEqual(errors);
    expect(params.id).toBe(Number(id));
  });

  it.each(['0', '-1', 'abc', '1.5', '9007199254740992'])(
    'rejects the branch ID %p',
    async (id) => {
      expect(
        await validate(plainToInstance(CinemaIdParamsDto, { id })),
      ).not.toEqual([]);
    },
  );
});
