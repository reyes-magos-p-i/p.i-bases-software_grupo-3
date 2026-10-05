import oracle from 'oracledb';
import { buildUserSearch } from './user-search.util';

describe('buildUserSearch', () => {
  it.each(['  Ana  Núñez  ', 'Ana\tNúñez', 'Ana\u00a0\u00a0Núñez'])(
    'normalizes whitespace without adding empty search terms: %p',
    (search) => {
      const binds: oracle.BindParameters = {};
      const expected: oracle.BindParameters = {};
      expect(buildUserSearch(search, 'employees', 'FULL_NAME', binds)).toBe(
        buildUserSearch('Ana Núñez', 'employees', 'FULL_NAME', expected),
      );
      expect(binds).toEqual(expected);
      expect(
        Object.keys(binds).filter((key) => key.startsWith('name')),
      ).toHaveLength(2);
    },
  );
  it('trims a single term', () => {
    const binds: oracle.BindParameters = {};
    buildUserSearch('  Ana  ', 'clients', 'FULL_NAME', binds);
    expect(binds).toEqual({
      name0: { val: '%ana%', type: oracle.STRING },
      search: { val: '%ana%', type: oracle.STRING },
    });
  });
  it.each(['', '   ', '\t\n'])(
    'treats an empty search as no additional filter: %p',
    (search) => {
      const binds = { existing: { val: 3, type: oracle.NUMBER } };
      expect(buildUserSearch(search, 'clients', 'FULL_NAME', binds)).toBe(
        '1 = 1',
      );
      expect(binds).toEqual({ existing: { val: 3, type: oracle.NUMBER } });
    },
  );
  it.each([
    ['clients', 'c', 'CLIENT_ID'],
    ['employees', 'e', 'EMPLOYEE_ID'],
  ] as const)(
    'uses bound names and section-specific columns for %s',
    (section, alias, idColumn) => {
      const binds: oracle.BindParameters = {};
      const name = alias + '.FIRST_NAME';
      const sql = buildUserSearch('Ana Núñez', section, name, binds);
      expect(binds).toEqual({
        name0: { val: '%ana%', type: oracle.STRING },
        name1: { val: '%núñez%', type: oracle.STRING },
        search: { val: '%ana núñez%', type: oracle.STRING },
      });
      expect(sql).toBe(
        String.raw`((LOWER(${name}) LIKE :name0 ESCAPE '\' AND LOWER(${name}) LIKE :name1 ESCAPE '\') OR LOWER(${alias}.EMAIL) LIKE :search ESCAPE '\' OR ${alias}.PHONE_NUMBER LIKE :search ESCAPE '\' OR TO_CHAR(${alias}.${idColumn}) LIKE :search ESCAPE '\')`,
      );
      expect(sql).not.toContain('Ana');
      expect(sql).not.toContain('Núñez');
    },
  );
  it.each(['clients', 'employees'] as const)(
    'escapes literal wildcard characters in %s without changing apostrophes',
    (section) => {
      const binds: oracle.BindParameters = {
        existing: { val: 3, type: oracle.NUMBER },
      };
      const sql = buildUserSearch(
        String.raw`O'Connor%_\tail`,
        section,
        'FULL_NAME',
        binds,
      );
      expect(binds).toEqual({
        existing: { val: 3, type: oracle.NUMBER },
        name0: { val: String.raw`%o'connor\%\_\\tail%`, type: oracle.STRING },
        search: { val: String.raw`%o'connor\%\_\\tail%`, type: oracle.STRING },
      });
      expect(sql).not.toContain("O'Connor");
      expect(sql).toContain(String.raw`LIKE :name0 ESCAPE '\'`);
    },
  );
});
