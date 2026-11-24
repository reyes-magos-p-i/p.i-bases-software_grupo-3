-- SCRUM-437: release and presale dates of a movie, to split the portal into Cartelera, Preventas
-- and Estrenos (docs/portal-sections.md).
--   RELEASE_DATE   day the movie opens. NULL means it is already showing (every movie before this
--                  migration), so existing movies stay in Cartelera.
--   PRESALE_START  first day of the presale. NULL means no presale. It needs a release date and
--                  must be earlier than it.
-- Apply as the schema owner (DEVELOPMENT first, then PRODUCTION) with Run Script (F5). It can be
-- run again: existing columns and the constraint are skipped. No new grants are needed.
SET SERVEROUTPUT ON

DECLARE
    v_count NUMBER;

    PROCEDURE ensure_column(p_column VARCHAR2) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM USER_TAB_COLUMNS
         WHERE TABLE_NAME = 'MOVIES' AND COLUMN_NAME = p_column;
        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE MOVIES ADD (' || p_column || ' DATE)';
            DBMS_OUTPUT.PUT_LINE('Agregada MOVIES.' || p_column);
        ELSE
            DBMS_OUTPUT.PUT_LINE('Ya existía MOVIES.' || p_column);
        END IF;
    END;
BEGIN
    ensure_column('RELEASE_DATE');
    ensure_column('PRESALE_START');

    SELECT COUNT(*) INTO v_count FROM USER_CONSTRAINTS
     WHERE TABLE_NAME = 'MOVIES' AND CONSTRAINT_NAME = 'CK_MOVIES_PRESALE_BEFORE_RELEASE';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE MOVIES ADD CONSTRAINT CK_MOVIES_PRESALE_BEFORE_RELEASE CHECK ('
            || 'PRESALE_START IS NULL OR (RELEASE_DATE IS NOT NULL AND PRESALE_START < RELEASE_DATE))';
        DBMS_OUTPUT.PUT_LINE('Agregada CK_MOVIES_PRESALE_BEFORE_RELEASE');
    ELSE
        DBMS_OUTPUT.PUT_LINE('Ya existía CK_MOVIES_PRESALE_BEFORE_RELEASE');
    END IF;
END;
/

SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM USER_TAB_COLUMNS
 WHERE TABLE_NAME = 'MOVIES' AND COLUMN_NAME IN ('RELEASE_DATE', 'PRESALE_START')
 ORDER BY COLUMN_NAME;
