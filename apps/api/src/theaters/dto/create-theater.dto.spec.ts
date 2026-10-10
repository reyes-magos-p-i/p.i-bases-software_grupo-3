import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTheaterDto } from './create-theater.dto';
import { UpdateTheaterDto } from './update-theater.dto';

const base = { cinema: 'Cinépolis Central', projectorName: 'IMAX' };

const errorsFor = async (cls: any, data: object) =>
  (await validate(plainToInstance(cls, data))).map((e) => e.property);

const validCases = [
  [1, 1, 1],
  [1, 5000, 5000],
  [5000, 1, 5000],
  [25, 200, 5000],
  [10, 10, 100],
];
const invalidCases = [
  [2, 3, 5],
  [0, 5, 0],
  [-1, 5, 5],
  [5, 0, 0],
  [5, -1, 5],
  [1, 1, 0],
  [1, 1, -1],
  [1, 5001, 5001],
  [2, 2500, 5001],
  [0, 0, 5001],
];

describe('CreateTheaterDto test matrix [filas, columnas, asientos]', () => {
  it.each(validCases)('passes for %i x %i = %i', async (x, y, seats) => {
    expect(await errorsFor(CreateTheaterDto, { ...base, dimensionX: x, dimensionY: y, numberOfSeats: seats })).toEqual([]);
  });

  it.each(invalidCases)('fails for %i x %i, seats %i', async (x, y, seats) => {
    expect((await errorsFor(CreateTheaterDto, { ...base, dimensionX: x, dimensionY: y, numberOfSeats: seats })).length).toBeGreaterThan(0);
  });
});

describe('CreateTheaterDto', () => {
  it('accepts matching dimensions, including 5000 seats', async () => {
    expect(await errorsFor(CreateTheaterDto, { ...base, numberOfSeats: 120, dimensionX: 10, dimensionY: 12 })).toEqual([]);
    expect(await errorsFor(CreateTheaterDto, { ...base, numberOfSeats: 5000, dimensionX: 100, dimensionY: 50 })).toEqual([]);
  });

  it('rejects seats that do not equal rows times columns', async () => {
    expect(await errorsFor(CreateTheaterDto, { ...base, numberOfSeats: 121, dimensionX: 10, dimensionY: 12 })).toContain('numberOfSeats');
  });

  it('rejects zero, negative and over-5000 values', async () => {
    expect(await errorsFor(CreateTheaterDto, { ...base, numberOfSeats: 0, dimensionX: 0, dimensionY: 5 })).toEqual(expect.arrayContaining(['numberOfSeats', 'dimensionX']));
    expect(await errorsFor(CreateTheaterDto, { ...base, numberOfSeats: 5001, dimensionX: 1, dimensionY: 5001 })).toContain('numberOfSeats');
    expect(await errorsFor(CreateTheaterDto, { ...base, numberOfSeats: 4, dimensionX: -2, dimensionY: -2 })).toEqual(expect.arrayContaining(['dimensionX', 'dimensionY']));
  });

  it('does not reject partial updates', async () => {
    expect(await errorsFor(UpdateTheaterDto, { dimensionX: 11 })).toEqual([]);
  });
});
