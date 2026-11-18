-- SCRUM-435 regression test for query 1 of 04_admin_compare_schemas.sql (column comparison).
-- It runs the same comparison block (compare:begin to compare:end, kept identical to 04 by
-- apps/api/src/database/environment-scripts.spec.ts) on fixture rows instead of DBA_TAB_COLUMNS,
-- so it needs no DBA privileges and changes nothing: any account can run it with Ctrl+Enter.
-- It returns one row: RESULT = PASS when the differences found are exactly the expected ones;
-- otherwise UNEXPECTED_ROWS and MISSING_ROWS show what the comparison got wrong.
-- Generated from 04: if the comparison block changes, copy it here again between the markers.
WITH source_columns AS (
    -- Identical plain NUMBER columns are not a difference (first row: it fixes the column types).
    SELECT CAST('DEVELOPMENT' AS VARCHAR2(4000)) AS OWNER, CAST('FIXTURE' AS VARCHAR2(4000)) AS TABLE_NAME, CAST('QUANTITY' AS VARCHAR2(4000)) AS COLUMN_NAME, CAST('NUMBER' AS VARCHAR2(4000)) AS DATA_TYPE, CAST(22 AS NUMBER) AS DATA_LENGTH, CAST(NULL AS NUMBER) AS DATA_PRECISION, CAST(NULL AS NUMBER) AS DATA_SCALE, CAST(NULL AS VARCHAR2(4000)) AS CHAR_USED, CAST(0 AS NUMBER) AS CHAR_LENGTH, CAST('N' AS VARCHAR2(4000)) AS NULLABLE, CAST('NO' AS VARCHAR2(4000)) AS DEFAULT_ON_NULL, CAST(NULL AS VARCHAR2(4000)) AS DATA_DEFAULT, CAST(NULL AS VARCHAR2(4000)) AS GENERATION_TYPE FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'QUANTITY', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', NULL, NULL FROM DUAL
    -- The regression from the review: same column, same base type, different numeric precision.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'AMOUNT', 'NUMBER', 22, 10, 2, NULL, 0, 'N', 'NO', NULL, NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'AMOUNT', 'NUMBER', 22, 12, 2, NULL, 0, 'N', 'NO', NULL, NULL FROM DUAL
    -- Different scale.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'RATE', 'NUMBER', 22, 10, 2, NULL, 0, 'N', 'NO', NULL, NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'RATE', 'NUMBER', 22, 10, 3, NULL, 0, 'N', 'NO', NULL, NULL FROM DUAL
    -- NUMBER against NUMBER(10,2): both precision and scale differ.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'BALANCE', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', NULL, NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'BALANCE', 'NUMBER', 22, 10, 2, NULL, 0, 'N', 'NO', NULL, NULL FROM DUAL
    -- Same CHAR_LENGTH, different character semantics (bytes against characters).
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'CODE', 'VARCHAR2', 20, NULL, NULL, 'B', 20, 'N', 'NO', NULL, NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'CODE', 'VARCHAR2', 80, NULL, NULL, 'C', 20, 'N', 'NO', NULL, NULL FROM DUAL
    -- Different length.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'NAME', 'VARCHAR2', 40, NULL, NULL, 'B', 40, 'Y', 'NO', NULL, NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'NAME', 'VARCHAR2', 50, NULL, NULL, 'B', 50, 'Y', 'NO', NULL, NULL FROM DUAL
    -- Identity columns: each side names its own sequence, which is not a difference.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'ID', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', '"DEVELOPMENT"."ISEQ$$_100".nextval', 'ALWAYS' FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'ID', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', '"PRODUCTION"."ISEQ$$_200".nextval', 'ALWAYS' FROM DUAL
    -- ... but a different generation type is.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'EXTERNAL_ID', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', '"DEVELOPMENT"."ISEQ$$_101".nextval', 'ALWAYS' FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'EXTERNAL_ID', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', '"PRODUCTION"."ISEQ$$_201".nextval', 'BY DEFAULT' FROM DUAL
    -- Surrounding whitespace in a default is not a difference.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'CREATED_AT', 'TIMESTAMP(6)', 11, NULL, 6, NULL, 0, 'Y', 'NO', 'SYSTIMESTAMP ', NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'CREATED_AT', 'TIMESTAMP(6)', 11, NULL, 6, NULL, 0, 'Y', 'NO', 'SYSTIMESTAMP', NULL FROM DUAL
    -- A default that names the schema is compared without it.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'NEXT_CODE', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', '"DEVELOPMENT"."CODE_SEQ".nextval', NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'NEXT_CODE', 'NUMBER', 22, NULL, NULL, NULL, 0, 'N', 'NO', '"PRODUCTION"."CODE_SEQ".nextval', NULL FROM DUAL
    -- A different default value is a difference.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'STATUS', 'VARCHAR2', 10, NULL, NULL, 'B', 10, 'N', 'NO', '''ACTIVE'' ', NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'STATUS', 'VARCHAR2', 10, NULL, NULL, 'B', 10, 'N', 'NO', '''INACTIVE''', NULL FROM DUAL
    -- Same default, different DEFAULT ON NULL.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'FLAG', 'NUMBER', 22, 1, 0, NULL, 0, 'N', 'NO', '0', NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'FLAG', 'NUMBER', 22, 1, 0, NULL, 0, 'N', 'YES', '0', NULL FROM DUAL
    -- Different nullability.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'NOTE', 'VARCHAR2', 100, NULL, NULL, 'B', 100, 'Y', 'NO', NULL, NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'NOTE', 'VARCHAR2', 100, NULL, NULL, 'B', 100, 'N', 'NO', NULL, NULL FROM DUAL
    -- Columns on one side only.
    UNION ALL SELECT 'DEVELOPMENT', 'FIXTURE', 'ONLY_DEVELOPMENT', 'NUMBER', 22, NULL, NULL, NULL, 0, 'Y', 'NO', NULL, NULL FROM DUAL
    UNION ALL SELECT 'PRODUCTION', 'FIXTURE', 'ONLY_PRODUCTION', 'NUMBER', 22, NULL, NULL, NULL, 0, 'Y', 'NO', NULL, NULL FROM DUAL
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
, expected AS (
    SELECT CAST('FIXTURE' AS VARCHAR2(4000)) AS TABLE_NAME, CAST('BALANCE' AS VARCHAR2(4000)) AS COLUMN_NAME, CAST('different' AS VARCHAR2(4000)) AS SIDE, CAST('DATA_PRECISION, DATA_SCALE' AS VARCHAR2(4000)) AS DIFFERENCES FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'AMOUNT', 'different', 'DATA_PRECISION' FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'CODE', 'different', 'DATA_LENGTH, CHAR_USED' FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'EXTERNAL_ID', 'different', 'DEFAULT' FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'FLAG', 'different', 'DEFAULT_ON_NULL' FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'NAME', 'different', 'DATA_LENGTH, CHAR_LENGTH' FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'NOTE', 'different', 'NULLABLE' FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'ONLY_DEVELOPMENT', 'only in DEVELOPMENT', NULL FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'ONLY_PRODUCTION', 'only in PRODUCTION', NULL FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'RATE', 'different', 'DATA_SCALE' FROM DUAL
    UNION ALL SELECT 'FIXTURE', 'STATUS', 'different', 'DEFAULT' FROM DUAL
),
actual AS (
    SELECT TABLE_NAME, COLUMN_NAME, SIDE, DIFFERENCES
      FROM column_differences
     WHERE SIDE <> 'different' OR DIFFERENCES IS NOT NULL
),
unexpected AS (SELECT * FROM actual MINUS SELECT * FROM expected),
missing AS (SELECT * FROM expected MINUS SELECT * FROM actual)
SELECT CASE WHEN (SELECT COUNT(*) FROM unexpected) = 0 AND (SELECT COUNT(*) FROM missing) = 0
            THEN 'PASS' ELSE 'FAIL' END AS RESULT,
       (SELECT COUNT(*) FROM actual) AS DIFFERENCES_FOUND,
       (SELECT LISTAGG(COLUMN_NAME || ' ' || SIDE || ' ' || DIFFERENCES, '; ') WITHIN GROUP (ORDER BY COLUMN_NAME)
          FROM unexpected) AS UNEXPECTED_ROWS,
       (SELECT LISTAGG(COLUMN_NAME || ' ' || SIDE || ' ' || DIFFERENCES, '; ') WITHIN GROUP (ORDER BY COLUMN_NAME)
          FROM missing) AS MISSING_ROWS
  FROM DUAL;
