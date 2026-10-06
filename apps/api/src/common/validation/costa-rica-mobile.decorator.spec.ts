import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CostaRicaMobile } from './costa-rica-mobile.decorator';

class MobileDto {
  @CostaRicaMobile()
  phone: string;
}

describe('CostaRicaMobile', () => {
  it.each(['88888888', '+506 7777-7777', ' 6666 6666 '])(
    'normalizes %s',
    async (phone) => {
      const dto = plainToInstance(MobileDto, { phone });
      expect(await validate(dto)).toEqual([]);
      expect(dto.phone).toMatch(/^[678]\d{7}$/u);
    },
  );
  it.each(['22222222', '+1 88888888', '', 'abcdefgh', 123, null, undefined])(
    'rejects %p',
    async (phone) => {
      const dto = plainToInstance(MobileDto, { phone });
      expect((await validate(dto)).map((error) => error.property)).toEqual([
        'phone',
      ]);
    },
  );
});
