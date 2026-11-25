-- SCRUM-434: undoes the cleanup of 03 from the BKP434_ backups, keeping every row created later.
-- Run as the schema owner (DEVELOPMENT or PRODUCTION) with Run Script (F5), in a window without
-- use of the site, only when the cleanup has to be reverted.
--
-- 03 only deleted rows and filled NULL columns, so this undoes exactly that:
--   1. Columns 03 filled go back to NULL where the backup has NULL: registration dates of clients
--      and employees, hire dates, and the format, technology and premiere flag of projections.
--   2. Every backed-up row that is missing is inserted again, parents before children.
-- Nothing is deleted. A DELETE of a whole table fails while other rows still reference it
-- (ORA-02292) and would also lose the rows created after the cleanup; this keeps them and
-- everything that references them.
--
-- The original values break two rules that 03 made true, so the restore relaxes them first and
-- puts them back afterwards, also when it fails:
--   - TRG_CLIENTS_REQUIRED_DATES and TRG_EMPLOYEES_REQUIRED_DATES reject NULL dates: disabled.
--   - GENERATED ALWAYS identity columns reject the original IDs: switched to BY DEFAULT, then
--     back to ALWAYS with START WITH LIMIT VALUE, so new IDs continue after the highest one.
-- All data changes run in one transaction. On any error nothing is restored, the triggers and
-- identity columns are put back, and the error is raised. Recovery steps:
-- docs/database-cleanup.md, section "Restaurar desde los respaldos".
SET SERVEROUTPUT ON

-- Same reason as 03: parallel DML can't update and insert the same tables in one transaction.
ALTER SESSION DISABLE PARALLEL DML;

DECLARE
    -- Parents before children, following the foreign keys between these tables.
    restore_order SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'COMPANIES', 'CLIENTS', 'EMPLOYEES', 'MOVIES', 'MOVIE_GENRES', 'MOVIE_LANGUAGES',
        'CINEMA_MOVIES', 'MOVIE_FUNCTIONS', 'MOVIE_FUNCTIONS_ACTIVITIES', 'INVOICES',
        'INVOICE_PRODUCTS', 'PURCHASE_TICKET_EMAILS', 'TICKETS', 'PASSWORD_RECOVERIES');
    date_triggers SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
        'TRG_CLIENTS_REQUIRED_DATES', 'TRG_EMPLOYEES_REQUIRED_DATES');
    always_tables  SYS.ODCIVARCHAR2LIST;
    always_columns SYS.ODCIVARCHAR2LIST;
    backups NUMBER;
    pending NUMBER;
    rules_failed PLS_INTEGER := 0;

    PROCEDURE report(p_step VARCHAR2, p_rows NUMBER) IS
    BEGIN
        DBMS_OUTPUT.PUT_LINE(RPAD(p_step, 62, '.') || ' ' || p_rows);
    END;

    PROCEDURE run_ddl(p_sql VARCHAR2) IS
    BEGIN
        EXECUTE IMMEDIATE p_sql;
        DBMS_OUTPUT.PUT_LINE('  ' || p_sql);
    END;

    -- Puts the triggers and identity columns back. Safe to run more than once; a step that
    -- fails is printed and the others still run.
    PROCEDURE put_rules_back IS
    BEGIN
        FOR i IN 1 .. always_tables.COUNT LOOP
            BEGIN
                run_ddl('ALTER TABLE ' || always_tables(i) || ' MODIFY ' || always_columns(i)
                    || ' GENERATED ALWAYS AS IDENTITY (START WITH LIMIT VALUE)');
            EXCEPTION WHEN OTHERS THEN
                rules_failed := rules_failed + 1;
                DBMS_OUTPUT.PUT_LINE('NO SE PUDO volver a ALWAYS ' || always_tables(i) || '.'
                    || always_columns(i) || ': ' || SQLERRM);
            END;
        END LOOP;
        FOR i IN 1 .. date_triggers.COUNT LOOP
            BEGIN
                run_ddl('ALTER TRIGGER ' || date_triggers(i) || ' ENABLE');
            EXCEPTION WHEN OTHERS THEN
                rules_failed := rules_failed + 1;
                DBMS_OUTPUT.PUT_LINE('NO SE PUDO activar ' || date_triggers(i) || ': ' || SQLERRM);
            END;
        END LOOP;
    END put_rules_back;

    -- Columns present in both the table and its backup, in table order.
    FUNCTION column_list(p_table VARCHAR2) RETURN VARCHAR2 IS
        v_columns VARCHAR2(32767);
    BEGIN
        SELECT LISTAGG('"' || t.COLUMN_NAME || '"', ', ') WITHIN GROUP (ORDER BY t.COLUMN_ID)
          INTO v_columns
          FROM USER_TAB_COLUMNS t
          JOIN USER_TAB_COLUMNS b ON b.TABLE_NAME = 'BKP434_' || p_table AND b.COLUMN_NAME = t.COLUMN_NAME
         WHERE t.TABLE_NAME = p_table;
        RETURN v_columns;
    END column_list;

    -- "t.KEY = b.KEY AND ..." over the primary key of the table.
    FUNCTION key_match(p_table VARCHAR2) RETURN VARCHAR2 IS
        v_match VARCHAR2(4000);
    BEGIN
        SELECT LISTAGG('t."' || cc.COLUMN_NAME || '" = b."' || cc.COLUMN_NAME || '"', ' AND ')
                   WITHIN GROUP (ORDER BY cc.POSITION)
          INTO v_match
          FROM USER_CONSTRAINTS c
          JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
         WHERE c.TABLE_NAME = p_table AND c.CONSTRAINT_TYPE = 'P';
        IF v_match IS NULL THEN
            RAISE_APPLICATION_ERROR(-20435, p_table || ' no tiene llave primaria.');
        END IF;
        RETURN v_match;
    END key_match;

    -- Backed-up rows of a table that are not in it.
    FUNCTION missing_rows(p_table VARCHAR2) RETURN NUMBER IS
        v_count NUMBER;
    BEGIN
        EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM BKP434_' || p_table || ' b WHERE NOT EXISTS (SELECT 1 FROM '
            || p_table || ' t WHERE ' || key_match(p_table) || ')' INTO v_count;
        RETURN v_count;
    END missing_rows;
BEGIN
    SELECT COUNT(*) INTO backups FROM USER_TABLES t
     WHERE t.TABLE_NAME IN (SELECT 'BKP434_' || COLUMN_VALUE FROM TABLE(restore_order));
    IF backups <> restore_order.COUNT THEN
        RAISE_APPLICATION_ERROR(-20434, 'Faltan respaldos BKP434_ en este esquema: no hay nada que restaurar.');
    END IF;

    -- Remember the ALWAYS identity columns before changing any of them.
    SELECT TABLE_NAME, COLUMN_NAME BULK COLLECT INTO always_tables, always_columns
      FROM USER_TAB_IDENTITY_COLS
     WHERE GENERATION_TYPE = 'ALWAYS'
       AND TABLE_NAME IN (SELECT COLUMN_VALUE FROM TABLE(restore_order))
     ORDER BY TABLE_NAME;

    DBMS_OUTPUT.PUT_LINE('Preparación (se revierte al final):');
    BEGIN
        FOR i IN 1 .. date_triggers.COUNT LOOP
            run_ddl('ALTER TRIGGER ' || date_triggers(i) || ' DISABLE');
        END LOOP;
        FOR i IN 1 .. always_tables.COUNT LOOP
            run_ddl('ALTER TABLE ' || always_tables(i) || ' MODIFY ' || always_columns(i)
                || ' GENERATED BY DEFAULT AS IDENTITY');
        END LOOP;

        -- From here on, only data changes: one transaction.
        -- 1. Columns 03 filled go back to NULL where the backup has NULL.
        UPDATE CLIENTS c SET CREATED_AT = NULL
         WHERE c.CREATED_AT IS NOT NULL
           AND EXISTS (SELECT 1 FROM BKP434_CLIENTS b WHERE b.CLIENT_ID = c.CLIENT_ID AND b.CREATED_AT IS NULL);
        report('Clientes: fecha de registro vuelve a NULL', SQL%ROWCOUNT);

        UPDATE EMPLOYEES e SET CREATED_AT = NULL
         WHERE e.CREATED_AT IS NOT NULL
           AND EXISTS (SELECT 1 FROM BKP434_EMPLOYEES b WHERE b.EMPLOYEE_ID = e.EMPLOYEE_ID AND b.CREATED_AT IS NULL);
        report('Empleados: fecha de registro vuelve a NULL', SQL%ROWCOUNT);

        UPDATE EMPLOYEES e SET HIRE_DATE = NULL
         WHERE e.HIRE_DATE IS NOT NULL
           AND EXISTS (SELECT 1 FROM BKP434_EMPLOYEES b WHERE b.EMPLOYEE_ID = e.EMPLOYEE_ID AND b.HIRE_DATE IS NULL);
        report('Empleados: fecha de contratación vuelve a NULL', SQL%ROWCOUNT);

        UPDATE MOVIE_FUNCTIONS f
           SET PROJECTION_FORMAT = (SELECT b.PROJECTION_FORMAT FROM BKP434_MOVIE_FUNCTIONS b WHERE b.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID),
               TECHNOLOGY = (SELECT b.TECHNOLOGY FROM BKP434_MOVIE_FUNCTIONS b WHERE b.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID),
               IS_PREMIERE = (SELECT b.IS_PREMIERE FROM BKP434_MOVIE_FUNCTIONS b WHERE b.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID)
         WHERE EXISTS (SELECT 1 FROM BKP434_MOVIE_FUNCTIONS b
                        WHERE b.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
                          AND b.PROJECTION_FORMAT IS NULL AND b.TECHNOLOGY IS NULL AND b.IS_PREMIERE IS NULL)
           AND (f.PROJECTION_FORMAT IS NOT NULL OR f.TECHNOLOGY IS NOT NULL OR f.IS_PREMIERE IS NOT NULL);
        report('Proyecciones: formato, tecnología y estreno vuelven a NULL', SQL%ROWCOUNT);

        -- 2. Missing rows, parents first. Rows created after the cleanup are never touched.
        FOR i IN 1 .. restore_order.COUNT LOOP
            EXECUTE IMMEDIATE 'INSERT INTO ' || restore_order(i) || ' (' || column_list(restore_order(i)) || ')'
                || ' SELECT ' || column_list(restore_order(i)) || ' FROM BKP434_' || restore_order(i) || ' b'
                || ' WHERE NOT EXISTS (SELECT 1 FROM ' || restore_order(i) || ' t WHERE '
                || key_match(restore_order(i)) || ')';
            report('Filas reinsertadas en ' || restore_order(i), SQL%ROWCOUNT);
        END LOOP;

        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            DBMS_OUTPUT.PUT_LINE('ERROR: ' || SQLERRM);
            DBMS_OUTPUT.PUT_LINE('No se restauró ningún dato. Se vuelven a poner los triggers y las identidades:');
            put_rules_back;
            RAISE;
    END;

    DBMS_OUTPUT.PUT_LINE('Datos restaurados. Se vuelven a poner los triggers y las identidades:');
    put_rules_back;
    IF rules_failed > 0 THEN
        RAISE_APPLICATION_ERROR(-20437, 'Los datos se restauraron, pero ' || rules_failed
            || ' trigger(s) o identidad(es) no volvieron a su estado: sigue los pasos manuales del documento.');
    END IF;

    -- Verification: every backed-up row is back.
    pending := 0;
    FOR i IN 1 .. restore_order.COUNT LOOP
        pending := pending + missing_rows(restore_order(i));
    END LOOP;
    report('Filas del respaldo que siguen faltando', pending);
    IF pending > 0 THEN
        RAISE_APPLICATION_ERROR(-20436, 'La restauración terminó, pero faltan ' || pending || ' filas del respaldo.');
    END IF;
    DBMS_OUTPUT.PUT_LINE('Restauración confirmada. 01 vuelve a listar los registros incompletos originales.');
END;
/

-- Both triggers must be ENABLED, and these identity columns ALWAYS again.
SELECT TRIGGER_NAME, STATUS FROM USER_TRIGGERS
 WHERE TRIGGER_NAME IN ('TRG_CLIENTS_REQUIRED_DATES', 'TRG_EMPLOYEES_REQUIRED_DATES')
UNION ALL
SELECT TABLE_NAME || '.' || COLUMN_NAME, GENERATION_TYPE FROM USER_TAB_IDENTITY_COLS
 WHERE TABLE_NAME IN ('COMPANIES', 'EMPLOYEES', 'MOVIES', 'PASSWORD_RECOVERIES');
