import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MaxUtf8Bytes } from './max-utf8-bytes.decorator';

class TextDto {
  @MaxUtf8Bytes(4)
  text: string;
}

describe('MaxUtf8Bytes', () => {
  const validateText = (text: unknown) =>
    validate(plainToInstance(TextDto, { text }));

  it.each(['', 'abcd', 'áé', '🎬', 'a漢', '\uFFFD'])(
    'accepts valid Unicode within four bytes: %p',
    async (text) => {
      await expect(validateText(text)).resolves.toEqual([]);
    },
  );

  it.each([
    'abcde',
    'áéa',
    '🎬a',
    '漢字',
    '\uD800',
    '\uDC00',
    'a\uD800b',
    '\uD800\uD800',
    undefined,
    null,
    123,
    false,
    [],
    {},
  ])('rejects invalid or oversized text without throwing: %p', async (text) => {
    await expect(validateText(text)).resolves.toEqual([
      expect.objectContaining({
        property: 'text',
        constraints: {
          maxUtf8Bytes:
            'El texto debe ser Unicode válido y no superar 4 bytes en UTF-8.',
        },
      }),
    ]);
  });

  it('supports a custom validation message', async () => {
    class CustomMessageDto {
      @MaxUtf8Bytes(1, { message: 'El campo excede el límite permitido.' })
      text: string;
    }

    const errors = await validate(
      plainToInstance(CustomMessageDto, { text: 'á' }),
    );

    expect(errors[0].constraints).toEqual({
      maxUtf8Bytes: 'El campo excede el límite permitido.',
    });
  });
});
