-- SCRUM-435: copies the PRODUCTION schema (structure and data) into DEVELOPMENT with Data Pump.
-- Run as ADMIN after 01 with Run Script (F5). It only reads PRODUCTION. Running it again refreshes
-- DEVELOPMENT: its tables are replaced with the current production ones, so anything created only
-- in DEVELOPMENT is lost. The dump file stays in DATA_PUMP_DIR and doubles as a backup.
-- Copied: tables and data, indexes, constraints, identity columns, the
-- REFRESH_MOVIE_FUNCTION_STATUS procedure, the triggers and MOVIE_FUNCTION_STATUS_JOB.
-- Not copied: the user itself, grants to other users and SQL Developer Web tables (DBTOOLS$).
--
-- The export is consistent as of one SCN (FLASHBACK_SCN), taken right before it starts, so every
-- table is copied from the same moment even if the app keeps writing. Each job is checked with
-- GET_STATUS: the copy is rejected unless the job COMPLETED without unexpected errors.
-- Running as an account other than ADMIN needs EXECUTE on DBMS_FLASHBACK.
SET SERVEROUTPUT ON

DECLARE
    v_file VARCHAR2(60) := 'production_' || TO_CHAR(SYSDATE, 'YYYYMMDD_HH24MISS');
    v_job  NUMBER;

    -- datapump:begin (02 and 05 share this block verbatim; environment-scripts.spec.ts checks it)
    -- Pins an export to the current SCN, so all its tables are read as of the same moment.
    PROCEDURE pin_to_current_scn(p_job NUMBER) IS
        v_scn NUMBER := DBMS_FLASHBACK.GET_SYSTEM_CHANGE_NUMBER;
    BEGIN
        DBMS_DATAPUMP.SET_PARAMETER(p_job, 'FLASHBACK_SCN', v_scn);
        DBMS_OUTPUT.PUT_LINE('Export consistent as of SCN ' || v_scn);
    END pin_to_current_scn;

    -- Starts a job and follows it with GET_STATUS until it ends. Every error the job reports is
    -- printed; only the ORA codes in p_expected (comma separated) are tolerated. The job fails
    -- unless it COMPLETED and had no other errors, including errors counted by the job but not
    -- delivered as log entries.
    PROCEDURE run_job(p_job NUMBER, p_label VARCHAR2, p_expected VARCHAR2 DEFAULT NULL) IS
        v_state      VARCHAR2(30) := 'UNDEFINED';
        v_status     KU$_STATUS;
        v_entries    KU$_LOGENTRY;
        v_index      NUMBER;
        v_code       VARCHAR2(9);
        v_reported   PLS_INTEGER := 0;
        v_counted    PLS_INTEGER := 0;
        v_unexpected PLS_INTEGER := 0;
    BEGIN
        DBMS_DATAPUMP.START_JOB(p_job);
        WHILE v_state NOT IN ('COMPLETED', 'STOPPED') LOOP
            DBMS_DATAPUMP.GET_STATUS(p_job,
                DBMS_DATAPUMP.KU$_STATUS_JOB_ERROR + DBMS_DATAPUMP.KU$_STATUS_JOB_STATUS,
                -1, v_state, v_status);
            IF BITAND(v_status.MASK, DBMS_DATAPUMP.KU$_STATUS_JOB_STATUS) <> 0
               AND v_status.JOB_STATUS IS NOT NULL THEN
                v_counted := GREATEST(v_counted, NVL(v_status.JOB_STATUS.ERROR_COUNT, 0));
            END IF;
            IF BITAND(v_status.MASK, DBMS_DATAPUMP.KU$_STATUS_JOB_ERROR) <> 0
               AND v_status.ERROR IS NOT NULL THEN
                v_entries := v_status.ERROR;
                v_index := v_entries.FIRST;
                WHILE v_index IS NOT NULL LOOP
                    v_reported := v_reported + 1;
                    v_code := REGEXP_SUBSTR(v_entries(v_index).LOGTEXT, 'ORA-[0-9]{5}');
                    IF v_code IS NOT NULL AND p_expected IS NOT NULL
                       AND INSTR(',' || p_expected || ',', ',' || v_code || ',') > 0 THEN
                        DBMS_OUTPUT.PUT_LINE(p_label || ' (expected) ' || v_entries(v_index).LOGTEXT);
                    ELSE
                        v_unexpected := v_unexpected + 1;
                        DBMS_OUTPUT.PUT_LINE(p_label || ' ERROR ' || v_entries(v_index).LOGTEXT);
                    END IF;
                    v_index := v_entries.NEXT(v_index);
                END LOOP;
            END IF;
        END LOOP;
        DBMS_DATAPUMP.DETACH(p_job);
        -- Errors the job counted but never delivered as entries can't be checked: they count as unexpected.
        v_unexpected := v_unexpected + GREATEST(v_counted - v_reported, 0);
        DBMS_OUTPUT.PUT_LINE(p_label || ': ' || v_state || ', ' || v_unexpected || ' unexpected error(s)');
        IF v_state <> 'COMPLETED' OR v_unexpected > 0 THEN
            RAISE_APPLICATION_ERROR(-20001, p_label || ' rejected: it ended as ' || v_state || ' with '
                || v_unexpected || ' unexpected error(s). Read its log with 06_admin_show_last_log.sql.');
        END IF;
    END run_job;
    -- datapump:end
BEGIN
    v_job := DBMS_DATAPUMP.OPEN(operation => 'EXPORT', job_mode => 'SCHEMA');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '.dmp', 'DATA_PUMP_DIR');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '_export.log', 'DATA_PUMP_DIR',
                           filetype => DBMS_DATAPUMP.KU$_FILE_TYPE_LOG_FILE);
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'SCHEMA_EXPR', 'IN (''PRODUCTION'')');
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'NAME_EXPR', 'NOT LIKE ''DBTOOLS$%''', 'TABLE');
    pin_to_current_scn(v_job);
    -- An export tolerates no errors: the copy is only imported from a clean dump.
    run_job(v_job, 'Export ' || v_file || '.dmp');

    v_job := DBMS_DATAPUMP.OPEN(operation => 'IMPORT', job_mode => 'SCHEMA');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '.dmp', 'DATA_PUMP_DIR');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '_import.log', 'DATA_PUMP_DIR',
                           filetype => DBMS_DATAPUMP.KU$_FILE_TYPE_LOG_FILE);
    DBMS_DATAPUMP.METADATA_REMAP(v_job, 'REMAP_SCHEMA', 'PRODUCTION', 'DEVELOPMENT');
    -- DEVELOPMENT already exists (01) and must not get the grants given to CINETADEL_APP.
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'EXCLUDE_PATH_EXPR',
        'IN (''USER'', ''SYSTEM_GRANT'', ''ROLE_GRANT'', ''DEFAULT_ROLE'', ''TABLESPACE_QUOTA'', ''OBJECT_GRANT'')');
    DBMS_DATAPUMP.SET_PARAMETER(v_job, 'TABLE_EXISTS_ACTION', 'REPLACE');
    -- On a refresh, objects that are not tables (procedure, triggers, job, identity sequences)
    -- already exist and are kept: ORA-31684 "object already exists" is the only tolerated error.
    run_job(v_job, 'Import into DEVELOPMENT', 'ORA-31684');
END;
/

-- Files and logs of this copy (read a log with 06_admin_show_last_log.sql or download it from Database Actions).
SELECT OBJECT_NAME, BYTES, LAST_MODIFIED
  FROM DBMS_CLOUD.LIST_FILES('DATA_PUMP_DIR')
 WHERE OBJECT_NAME LIKE 'production_%'
 ORDER BY LAST_MODIFIED DESC;

-- Next step: 04_admin_compare_schemas.sql must return no rows.
