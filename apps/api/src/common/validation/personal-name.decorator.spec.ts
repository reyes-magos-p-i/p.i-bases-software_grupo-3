import { validate } from 'class-validator';
import { PersonalName } from './personal-name.decorator';

class Profile {
  @PersonalName()
  name: unknown;
}

describe('PersonalName', () => {
  it.each(['Ana', 'María José', 'Muñoz', 'Jose\u0301', '李明', 'أحمد'])(
    'accepts names with letters and accents: %s',
    async (name) => {
      expect(await validate(Object.assign(new Profile(), { name }))).toEqual(
        [],
      );
    },
  );
  it.each([
    '',
    ' ',
    'Ana2',
    'Ana!',
    'Ana-María',
    "O'Connor",
    '🎬',
    '\u0301Ana',
    'Ana\nMaría',
    'Ana\tMaría',
    12,
    null,
    undefined,
  ])('rejects an invalid name: %p', async (name) => {
    const errors = await validate(Object.assign(new Profile(), { name }));
    expect(errors[0].constraints).toEqual({
      personalName:
        'Usa solo letras y espacios; no incluyas números ni símbolos.',
    });
  });
});
