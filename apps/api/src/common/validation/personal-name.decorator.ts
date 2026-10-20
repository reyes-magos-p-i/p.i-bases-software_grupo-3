import { ValidateBy, type ValidationOptions } from 'class-validator';

export function PersonalName(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'personalName',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          /^\p{L}[\p{L}\p{M}]*(?: +\p{L}[\p{L}\p{M}]*)*$/u.test(value),
        defaultMessage: () =>
          'Usa solo letras y espacios; no incluyas números ni símbolos.',
      },
    },
    options,
  );
}
