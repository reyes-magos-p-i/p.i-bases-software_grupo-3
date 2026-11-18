-- SCRUM-435: compares the structure of DEVELOPMENT and PRODUCTION. Run as ADMIN.
-- After 02, and after applying the release migrations to PRODUCTION, every query returns no rows.

-- 1 and 2. Columns that exist on only one side, or exist on both but are defined differently.
--    Compared, in both directions: type, length (DATA_LENGTH and CHAR_LENGTH), precision, scale,
--    character semantics (CHAR_USED: B = bytes, C = characters), nullability and the default
--    (value, DEFAULT ON NULL and identity). A FULL OUTER JOIN on table and column makes the
--    comparison symmetric, and DECODE treats two NULLs as equal, so NUMBER(10,2) against
--    NUMBER(12,2) is a difference and NUMBER against NUMBER is not.
--    Defaults are normalized before comparing: an identity column's default names its own
--    sequence ("<schema>"."ISEQ$$_<n>".nextval), which differs on each side by design, so it
--    becomes IDENTITY <ALWAYS | BY DEFAULT>; other schema prefixes become "<schema>", and
--    surrounding or repeated whitespace is ignored.
WITH source_columns AS (
    SELECT c.OWNER, c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.DATA_LENGTH, c.DATA_PRECISION,
           c.DATA_SCALE, c.CHAR_USED, c.CHAR_LENGTH, c.NULLABLE, c.DEFAULT_ON_NULL,
           c.DATA_DEFAULT_VC AS DATA_DEFAULT, i.GENERATION_TYPE
      FROM DBA_TAB_COLUMNS c
      LEFT JOIN DBA_TAB_IDENTITY_COLS i
        ON i.OWNER = c.OWNER AND i.TABLE_NAME = c.TABLE_NAME AND i.COLUMN_NAME = c.COLUMN_NAME
     WHERE c.OWNER IN ('DEVELOPMENT', 'PRODUCTION')
       AND c.TABLE_NAME NOT LIKE 'DBTOOLS$%' AND c.TABLE_NAME NOT LIKE 'BIN$%'
),
-- compare:begin (tests/04_compare_columns_regression.sql runs this same block on fixture rows)
normalized AS (
    SELECT OWNER, TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
           CHAR_USED, CHAR_LENGTH, NULLABLE, DEFAULT_ON_NULL,
           CASE WHEN GENERATION_TYPE IS NOT NULL THEN 'IDENTITY ' || GENERATION_TYPE
                ELSE REGEXP_REPLACE(REGEXP_REPLACE(TRIM(DATA_DEFAULT), '\s+', ' '),
                                    '"(DEVELOPMENT|PRODUCTION)"\.', '"<schema>".')
           END AS DEFAULT_VALUE
      FROM source_columns
),
described AS (
    SELECT n.*,
           DATA_TYPE || ' length=' || DATA_LENGTH
           || ' precision=' || NVL(TO_CHAR(DATA_PRECISION), '-') || ' scale=' || NVL(TO_CHAR(DATA_SCALE), '-')
           || ' chars=' || NVL(CHAR_USED, '-') || '/' || CHAR_LENGTH || ' nullable=' || NULLABLE
           || ' default=' || NVL(DEFAULT_VALUE, '-') || ' on_null=' || NVL(DEFAULT_ON_NULL, '-') AS DEFINITION
      FROM normalized n
),
development_columns AS (SELECT * FROM described WHERE OWNER = 'DEVELOPMENT'),
production_columns AS (SELECT * FROM described WHERE OWNER = 'PRODUCTION'),
column_differences AS (
    SELECT COALESCE(d.TABLE_NAME, p.TABLE_NAME) AS TABLE_NAME,
           COALESCE(d.COLUMN_NAME, p.COLUMN_NAME) AS COLUMN_NAME,
           CASE WHEN p.COLUMN_NAME IS NULL THEN 'only in DEVELOPMENT'
                WHEN d.COLUMN_NAME IS NULL THEN 'only in PRODUCTION'
                ELSE 'different' END AS SIDE,
           CASE WHEN d.COLUMN_NAME IS NOT NULL AND p.COLUMN_NAME IS NOT NULL THEN
               LTRIM(DECODE(d.DATA_TYPE, p.DATA_TYPE, NULL, ', DATA_TYPE')
                     || DECODE(d.DATA_LENGTH, p.DATA_LENGTH, NULL, ', DATA_LENGTH')
                     || DECODE(d.DATA_PRECISION, p.DATA_PRECISION, NULL, ', DATA_PRECISION')
                     || DECODE(d.DATA_SCALE, p.DATA_SCALE, NULL, ', DATA_SCALE')
                     || DECODE(d.CHAR_USED, p.CHAR_USED, NULL, ', CHAR_USED')
                     || DECODE(d.CHAR_LENGTH, p.CHAR_LENGTH, NULL, ', CHAR_LENGTH')
                     || DECODE(d.NULLABLE, p.NULLABLE, NULL, ', NULLABLE')
                     || DECODE(d.DEFAULT_VALUE, p.DEFAULT_VALUE, NULL, ', DEFAULT')
                     || DECODE(d.DEFAULT_ON_NULL, p.DEFAULT_ON_NULL, NULL, ', DEFAULT_ON_NULL'), ', ')
           END AS DIFFERENCES,
           d.DEFINITION AS DEVELOPMENT_DEFINITION,
           p.DEFINITION AS PRODUCTION_DEFINITION
      FROM development_columns d
      FULL OUTER JOIN production_columns p
        ON p.TABLE_NAME = d.TABLE_NAME AND p.COLUMN_NAME = d.COLUMN_NAME
)
-- compare:end
SELECT SIDE, TABLE_NAME, COLUMN_NAME, DIFFERENCES, DEVELOPMENT_DEFINITION, PRODUCTION_DEFINITION
  FROM column_differences
 WHERE SIDE <> 'different' OR DIFFERENCES IS NOT NULL
 ORDER BY TABLE_NAME, COLUMN_NAME, SIDE;

-- 3. Constraints, indexes, procedures, triggers and jobs that exist on only one side
--    (system-generated names are compared by table and type instead).
SELECT 'only in ' || OWNER AS SIDE, OBJECT_TYPE, OBJECT_NAME
  FROM (SELECT OWNER, OBJECT_TYPE, OBJECT_NAME,
               COUNT(*) OVER (PARTITION BY OBJECT_TYPE, OBJECT_NAME) AS SIDES
          FROM DBA_OBJECTS
         WHERE OWNER IN ('DEVELOPMENT', 'PRODUCTION')
           AND OBJECT_TYPE IN ('TABLE', 'INDEX', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'VIEW', 'JOB')
           AND OBJECT_NAME NOT LIKE 'SYS\_%' ESCAPE '\'
           AND OBJECT_NAME NOT LIKE 'DBTOOLS$%'
           AND OBJECT_NAME NOT LIKE 'BIN$%')
 WHERE SIDES = 1
UNION ALL
SELECT 'only in ' || OWNER, 'CONSTRAINT ' || CONSTRAINT_TYPE, TABLE_NAME || '.' || CONSTRAINT_NAME
  FROM (SELECT OWNER, CONSTRAINT_TYPE, TABLE_NAME, CONSTRAINT_NAME,
               COUNT(*) OVER (PARTITION BY CONSTRAINT_TYPE, TABLE_NAME, CONSTRAINT_NAME) AS SIDES
          FROM DBA_CONSTRAINTS
         WHERE OWNER IN ('DEVELOPMENT', 'PRODUCTION')
           AND CONSTRAINT_NAME NOT LIKE 'SYS\_%' ESCAPE '\'
           AND TABLE_NAME NOT LIKE 'BIN$%' AND TABLE_NAME NOT LIKE 'DBTOOLS$%')
 WHERE SIDES = 1
ORDER BY 2, 3;

-- 4. Invalid objects in either schema (for example a procedure that lost a column).
SELECT OWNER, OBJECT_TYPE, OBJECT_NAME, STATUS
  FROM DBA_OBJECTS
 WHERE OWNER IN ('DEVELOPMENT', 'PRODUCTION') AND STATUS <> 'VALID'
 ORDER BY 1, 2, 3;

-- 5. Real row counts per table, side by side (informative: they only match right after 02).
--    NUM_ROWS in DBA_TABLES is a statistic from the last analysis, so it is not used here.
SELECT TABLE_NAME,
       TO_NUMBER(EXTRACTVALUE(XMLTYPE(DBMS_XMLGEN.GETXML(
           'SELECT COUNT(*) C FROM "PRODUCTION"."' || TABLE_NAME || '"')), '/ROWSET/ROW/C')) AS PRODUCTION_ROWS,
       TO_NUMBER(EXTRACTVALUE(XMLTYPE(DBMS_XMLGEN.GETXML(
           'SELECT COUNT(*) C FROM "DEVELOPMENT"."' || TABLE_NAME || '"')), '/ROWSET/ROW/C')) AS DEVELOPMENT_ROWS
  FROM DBA_TABLES
 WHERE OWNER = 'PRODUCTION' AND TABLE_NAME NOT LIKE 'DBTOOLS$%' AND TABLE_NAME NOT LIKE 'BIN$%'
 ORDER BY TABLE_NAME;
