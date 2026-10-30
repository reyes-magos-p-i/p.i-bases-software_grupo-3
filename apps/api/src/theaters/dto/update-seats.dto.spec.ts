import {
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { UpdateSeatsDto } from './update-seats.dto';

describe('UpdateSeatsDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const seats = [{ rowNumber: 1, columnNumber: 2 }];

  function validate(body: unknown) {
    return pipe.transform(body, {
      type: 'body',
      metatype: UpdateSeatsDto,
    });
  }

  it.each([
    { seats, state: 'free' },
    { seats, type: 'vip' },
    { seats, state: 'unavailable', type: 'accessibility' },
  ])('accepts valid updates: %o', async body => {
    const result = await validate(body);

    expect(result).toBeInstanceOf(UpdateSeatsDto);
    expect(result).toEqual(body);
  });

  it.each([
    { seats },
    { seats, state: 'invalid' },
    { seats, type: 'invalid' },
    { seats, state: null },
    { seats, type: null },
    { seats: [], type: 'vip' },
    { type: 'vip' },
    {
      seats: [{ rowNumber: 0, columnNumber: 1 }],
      type: 'vip',
    },
    {
      seats: [{ rowNumber: 1, columnNumber: 1.5 }],
      type: 'vip',
    },
    {
      seats: [{ rowNumber: '1', columnNumber: 2 }],
      type: 'vip',
    },
    {
      seats,
      type: 'vip',
      unexpected: true,
    },
    {
      seats: [{ rowNumber: 1, columnNumber: 2, unexpected: true }],
      type: 'vip',
    },
  ])('rejects invalid updates: %o', async body => {
    await expect(validate(body))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects more than 10000 seats', async () => {
    await expect(
      validate({
        seats: Array.from({ length: 10001 }, () => ({
          rowNumber: 1,
          columnNumber: 1,
        })),
        type: 'vip',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
