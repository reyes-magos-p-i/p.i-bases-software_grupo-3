import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKENS = [
  'primary-color',
  'accent-color',
  'page-background',
  'surface-background',
  'content-background',
] as const;
export type EmailTheme = Record<(typeof TOKENS)[number], string>;

export function readEmailTheme(): EmailTheme {
  const packaged = join(
    __dirname,
    '../assets/email-theme/styles/variables.css',
  );
  const source = join(__dirname, '../../../web/src/styles/variables.css');
  const css = readFileSync(existsSync(packaged) ? packaged : source, 'utf8');
  return Object.fromEntries(
    TOKENS.map((token) => {
      const color = new RegExp(
        '--' + token + ':\\s*(#[a-fA-F0-9]{6})\\s*;',
      ).exec(css)?.[1];
      if (!color) throw new Error('Missing email theme token: ' + token);
      return [token, color];
    }),
  ) as EmailTheme;
}
