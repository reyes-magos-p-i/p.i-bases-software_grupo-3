import { Transform } from 'class-transformer';

/** Converts a numeric query/path string to a number; anything else is left for validation to reject. */
export const ToInteger = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value,
  );
