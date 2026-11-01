import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';

// Accepts only plain decimal digits. Declared on `string` route params because the
// global ValidationPipe already coerces `number` params with `+value`, which lets
// "+1", "1e0" or " " through a numeric check.
@Injectable()
export class ParseDecimalIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const id = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(id)) {
      throw new BadRequestException(
        'El identificador debe ser un número entero positivo.',
      );
    }
    return value;
  }
}
