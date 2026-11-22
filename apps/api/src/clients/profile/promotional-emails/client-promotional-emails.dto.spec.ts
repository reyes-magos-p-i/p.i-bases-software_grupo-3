import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateClientPromotionalEmailsDto } from './client-promotional-emails.dto';

describe('Client promotional email validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: UpdateClientPromotionalEmailsDto,
    });

  it.each([{ enabled: true }, { enabled: false }])(
    'accepts %p',
    async (value) => {
      await expect(validate(value)).resolves.toEqual(value);
    },
  );

  it.each([
    {},
    { enabled: 'yes' },
    { enabled: 1 },
    { enabled: true, extra: 1 },
  ])('rejects %p', async (value) => {
    await expect(validate(value)).rejects.toThrow(BadRequestException);
  });
});
