import oracle from 'oracledb';

function likePattern(value: string): string {
  return '%' + value.toLowerCase().replace(/[\\%_]/gu, String.raw`\$&`) + '%';
}

export function buildUserSearch(
  search: string,
  section: 'clients' | 'employees',
  name: string,
  binds: Exclude<oracle.BindParameters, unknown[]>,
): string {
  const alias = section === 'clients' ? 'c' : 'e';
  const idColumn = section === 'clients' ? 'CLIENT_ID' : 'EMPLOYEE_ID';
  const normalized = search.trim().replace(/\s+/gu, ' ');
  if (!normalized) return '1 = 1';
  const terms = normalized.split(' ').map((term, index) => {
    binds[`name${index}`] = { val: likePattern(term), type: oracle.STRING };
    return String.raw`LOWER(${name}) LIKE :name${index} ESCAPE '\'`;
  });
  binds.search = { val: likePattern(normalized), type: oracle.STRING };
  return String.raw`((${terms.join(' AND ')}) OR LOWER(${alias}.EMAIL) LIKE :search ESCAPE '\' OR ${alias}.PHONE_NUMBER LIKE :search ESCAPE '\' OR TO_CHAR(${alias}.${idColumn}) LIKE :search ESCAPE '\')`;
}
