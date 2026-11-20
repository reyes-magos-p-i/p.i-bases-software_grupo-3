import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// SCRUM-435: the admin scripts in database/environments run by hand in the Database Actions SQL
// worksheet, so CI can't execute them. These checks keep their safety rules from regressing.
const directory = join(process.cwd(), '..', '..', 'database', 'environments');
const read = (file: string) => readFileSync(join(directory, file), 'utf8');

const scripts = {
  copy: read('02_admin_copy_production_to_development.sql'),
  compare: read('04_admin_compare_schemas.sql'),
  backup: read('05_admin_backup_production.sql'),
  regression: read('tests/04_compare_columns_regression.sql'),
};

function between(text: string, begin: string, end: string) {
  const start = text.indexOf(begin);
  const finish = text.indexOf(end, start);
  if (start < 0 || finish < 0) throw new Error(`Missing ${begin} / ${end}`);
  return text.slice(start, finish + end.length);
}

const dataPumpBlock = (text: string) =>
  between(text, '-- datapump:begin', '-- datapump:end');
const comparisonBlock = (text: string) =>
  between(text, '-- compare:begin', '-- compare:end');

// Statements of the main block of 02 and 05, after the shared declarations.
const mainBlock = (text: string) =>
  text.slice(text.indexOf('-- datapump:end'), text.lastIndexOf('END;'));

describe('Data Pump scripts (02 copy, 05 backup)', () => {
  it('share the same job block, so the copy and the backup are checked alike', () => {
    expect(dataPumpBlock(scripts.backup)).toBe(dataPumpBlock(scripts.copy));
  });

  it('pin every export to one SCN taken before the job starts', () => {
    const block = dataPumpBlock(scripts.copy);
    expect(block).toContain('DBMS_FLASHBACK.GET_SYSTEM_CHANGE_NUMBER');
    expect(block).toContain(
      "DBMS_DATAPUMP.SET_PARAMETER(p_job, 'FLASHBACK_SCN', v_scn)",
    );

    for (const text of [scripts.copy, scripts.backup]) {
      const main = mainBlock(text);
      const exportStart = main.indexOf("operation => 'EXPORT'");
      const pin = main.indexOf('pin_to_current_scn(v_job)', exportStart);
      const run = main.indexOf('run_job(v_job', exportStart);
      expect(exportStart).toBeGreaterThan(-1);
      expect(pin).toBeGreaterThan(exportStart);
      expect(run).toBeGreaterThan(pin);
    }
  });

  it('start jobs only inside run_job and follow them with GET_STATUS', () => {
    const block = dataPumpBlock(scripts.copy);
    expect(block).toMatch(
      /DBMS_DATAPUMP\.START_JOB\(p_job\);\s+WHILE v_state NOT IN \('COMPLETED', 'STOPPED'\) LOOP\s+DBMS_DATAPUMP\.GET_STATUS\(/,
    );
    expect(block).toContain('DBMS_DATAPUMP.KU$_STATUS_JOB_ERROR');
    expect(block).toContain('JOB_STATUS.ERROR_COUNT');

    for (const text of [scripts.copy, scripts.backup]) {
      expect(mainBlock(text)).not.toContain('START_JOB');
      expect(text).not.toContain('WAIT_FOR_JOB');
    }
  });

  it('reject a job that did not complete or reported unexpected errors', () => {
    expect(dataPumpBlock(scripts.copy)).toMatch(
      /IF v_state <> 'COMPLETED' OR v_unexpected > 0 THEN\s+RAISE_APPLICATION_ERROR/,
    );
  });

  it('tolerate no export error, and only "object already exists" on the import', () => {
    const calls = [scripts.copy, scripts.backup].flatMap((text) =>
      [...mainBlock(text).matchAll(/run_job\(([^;]*)\);/g)].map(
        (match) => match[1],
      ),
    );
    expect(calls).toEqual([
      "v_job, 'Export ' || v_file || '.dmp'",
      "v_job, 'Import into DEVELOPMENT', 'ORA-31684'",
      "v_job, 'Backup ' || v_file || '.dmp'",
    ]);
  });
});

describe('Schema comparison (04)', () => {
  it('runs the regression test on the same comparison block', () => {
    expect(comparisonBlock(scripts.regression)).toBe(
      comparisonBlock(scripts.compare),
    );
  });

  it.each([
    'DATA_TYPE',
    'DATA_LENGTH',
    'DATA_PRECISION',
    'DATA_SCALE',
    'CHAR_USED',
    'CHAR_LENGTH',
    'NULLABLE',
    'DEFAULT_VALUE',
    'DEFAULT_ON_NULL',
  ])('compares %s on both sides, treating two NULLs as equal', (column) => {
    expect(comparisonBlock(scripts.compare)).toContain(
      `DECODE(d.${column}, p.${column}, NULL,`,
    );
  });

  it('compares both directions in one FULL OUTER JOIN', () => {
    const block = comparisonBlock(scripts.compare);
    expect(block).toContain('FROM development_columns d');
    expect(block).toMatch(
      /FULL OUTER JOIN production_columns p\s+ON p\.TABLE_NAME = d\.TABLE_NAME AND p\.COLUMN_NAME = d\.COLUMN_NAME/,
    );
    expect(block).toContain("'only in DEVELOPMENT'");
    expect(block).toContain("'only in PRODUCTION'");
  });

  it('normalizes identity defaults and schema prefixes before comparing', () => {
    const block = comparisonBlock(scripts.compare);
    expect(block).toContain("'IDENTITY ' || GENERATION_TYPE");
    expect(block).toContain(String.raw`'"(DEVELOPMENT|PRODUCTION)"\.'`);
    expect(scripts.compare).toContain('c.DATA_DEFAULT_VC AS DATA_DEFAULT');
  });

  it('keeps the object, constraint, validity and row count checks', () => {
    expect(scripts.compare).toContain('FROM DBA_OBJECTS');
    expect(scripts.compare).toContain('FROM DBA_CONSTRAINTS');
    expect(scripts.compare).toContain("STATUS <> 'VALID'");
    expect(scripts.compare).toContain('SELECT COUNT(*) C FROM "PRODUCTION"');
    expect(scripts.compare).toContain('SELECT COUNT(*) C FROM "DEVELOPMENT"');
  });

  it('has a regression for the same column with a different numeric precision', () => {
    expect(scripts.regression).toContain(
      "'DEVELOPMENT', 'FIXTURE', 'AMOUNT', 'NUMBER', 22, 10, 2",
    );
    expect(scripts.regression).toContain(
      "'PRODUCTION', 'FIXTURE', 'AMOUNT', 'NUMBER', 22, 12, 2",
    );
    expect(scripts.regression).toContain(
      "'FIXTURE', 'AMOUNT', 'different', 'DATA_PRECISION'",
    );
  });
});

describe('Environment scripts in the SQL worksheet', () => {
  it.each(Object.entries(scripts))(
    '%s uses no command the worksheet blocks',
    (_name, text) => {
      expect(text).not.toMatch(
        /^\s*(WHENEVER|ACCEPT|DEFINE|SET\s+VERIFY)\b/im,
      );
      expect(text).not.toMatch(/&\w/);
    },
  );
});
