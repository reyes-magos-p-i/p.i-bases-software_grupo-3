import {
  ValidateBy,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(value))
    return false;
  const date = new Date(value + 'T00:00:00Z');
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function todayInCostaRica(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function DateOnly(
  rules: { notFuture?: boolean; notBefore?: string; minimumAge?: number } = {},
  options?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'dateOnly',
      validator: {
        validate(value: unknown, args?: ValidationArguments): boolean {
          if (!isDateOnly(value)) return false;
          const today = todayInCostaRica();
          if (rules.notFuture && value > today) return false;
          if (
            rules.minimumAge !== undefined &&
            !oldEnough(value, today, rules.minimumAge)
          )
            return false;
          const earlier: unknown = rules.notBefore
            ? (args?.object as Record<string, unknown> | undefined)?.[
                rules.notBefore
              ]
            : undefined;
          return !isDateOnly(earlier) || value >= earlier;
        },
        defaultMessage: () => 'Selecciona una fecha válida.',
      },
    },
    options,
  );
}

function oldEnough(value: string, today: string, minimum: number): boolean {
  const age = Number(today.slice(0, 4)) - Number(value.slice(0, 4));
  return age > minimum || (age === minimum && value.slice(5) <= today.slice(5));
}
