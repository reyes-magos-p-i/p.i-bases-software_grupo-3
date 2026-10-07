import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

export function CostaRicaMobile(): PropertyDecorator {
  return (target, property) => {
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') return value;
      const match = /^(?:\+506[ -]?)?([678]\d{3})[ -]?(\d{4})$/u.exec(
        value.trim(),
      );
      return match ? match[1] + match[2] : value.trim();
    })(target, property);
    Matches(/^[678]\d{7}$/u, {
      message:
        'Ingresa un celular de Costa Rica de ocho dígitos que comience con 6, 7 u 8.',
    })(target, property);
  };
}
