import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CinemaIdParamsDto } from './cinema-id-params.dto';
import { CreateCinemaDto } from './create-cinema.dto';
import { ListCinemasQueryDto } from './list-cinemas-query.dto';

const messages = async (payload: object) =>
  (await validate(plainToInstance(CreateCinemaDto, payload))).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );

describe('Branch form DTO', () => {
  const company = { companyId: 21 };

  it.each([
    ['A'],
    ['Sucursal Gran Centro Comercial Heredia Norte Oeste'],
    ['Sucursal Peñas Blancas San Ramón'],
  ])('accepts the name %p (UT-007, UT-008, UT-010)', async (name) => {
    const data = plainToInstance(CreateCinemaDto, { name, ...company });
    expect(await validate(data)).toEqual([]);
    expect(data.name).toBe(name);
  });

  it('trims the name and joins accents written as separate marks', async () => {
    const data = plainToInstance(CreateCinemaDto, {
      name: '  San Ra\u0301mo\u0301n  ',
      ...company,
    });
    expect(await validate(data)).toEqual([]);
    expect(data.name).toBe('San Rámón');
  });

  it.each([[''], ['   '], [undefined], [null], [5]])(
    'requires a name (%p)',
    async (name) => {
      expect(await messages({ name, ...company })).toContain(
        'El nombre es obligatorio',
      );
    },
  );

  it.each([
    ['Sucursal 01'],
    ['Heredia@Centro#'],
    ['Sucursal-Norte.'],
    ['A\tB'],
  ])('only accepts letters and spaces (%p)', async (name) => {
    expect(await messages({ name, ...company })).toEqual([
      'El nombre solo puede contener letras y espacios',
    ]);
  });

  it('rejects a name of 51 characters (UT-009)', async () => {
    expect(
      await messages({
        name: 'Sucursal Gran Centro Comercial Heredia Norte Oestes',
        ...company,
      }),
    ).toEqual(['El nombre debe tener entre 1 y 50 caracteres']);
  });

  it.each([[undefined], [null], [''], ['21'], [0], [1.5]])(
    'requires a company (%p)',
    async (companyId) => {
      expect(await messages({ name: 'Sucursal Cartago', companyId })).toContain(
        'Debe seleccionar una compañía',
      );
    },
  );
});

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
