import { Buffer } from 'node:buffer';
import { ValidateBy, type ValidationOptions } from 'class-validator';

export function MaxUtf8Bytes(
  maxBytes: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxUtf8Bytes',
      constraints: [maxBytes],
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' &&
          // Unicode mode matches surrogate code units only when they are unpaired.
          !/[\uD800-\uDFFF]/u.test(value) &&
          Buffer.byteLength(value, 'utf8') <= maxBytes,
        defaultMessage: () =>
          'El texto debe ser Unicode válido y no superar $constraint1 bytes en UTF-8.',
      },
    },
    validationOptions,
  );
}
