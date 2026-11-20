import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// SCRUM-435: the session schema comes from DB_SCHEMA (DEVELOPMENT or PRODUCTION).
// A query that names a schema would read production from the dev branch, or fail there.
describe('SQL without a fixed schema', () => {
  const root = join(process.cwd(), 'src');
  const sources = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }));

  it('reads the API sources', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('never qualifies a table with the DEVELOPMENT or PRODUCTION schema', () => {
    const offenders = sources
      .filter(({ text }) => /\b(PRODUCTION|DEVELOPMENT)\.[A-Za-z_]/i.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
