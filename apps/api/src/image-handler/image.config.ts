import { resolve } from 'node:path';

export const MAX_POSTER_SIZE = 5 * 1024 * 1024;

// Use an absolute persistent directory in production.
export const IMAGES_DIRECTORY = resolve(
  process.env.IMAGES_DIRECTORY ?? 'uploads',
);
