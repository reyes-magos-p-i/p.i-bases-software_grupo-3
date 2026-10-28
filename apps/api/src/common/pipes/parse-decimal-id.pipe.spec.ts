import { BadRequestException } from '@nestjs/common';
import { ParseDecimalIdPipe } from './parse-decimal-id.pipe';

describe('ParseDecimalIdPipe', () => {
  const pipe = new ParseDecimalIdPipe();

  it.each(['1', '42', '0', '9007199254740991'])('accepts %s', (value) => {
    expect(pipe.transform(value)).toBe(value);
  });

  it.each(['abc', '1e999', '1e0', '+1', '-1', '1.5', '0x1', ' ', '%20', '', '9007199254740993'])(
    'rejects %j',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});
