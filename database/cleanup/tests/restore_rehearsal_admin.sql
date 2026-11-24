-- SCRUM-434: disposable copy of DEVELOPMENT to rehearse 04_restore_from_backups.sql.
-- Run as ADMIN with Run Script (F5), after creating the user CLEANUP_REHEARSAL in Database Actions >
-- Administration > Database Users (quota on DATA; it does not need web access).
-- DEVELOPMENT is copied as it is after the cleanup, so the copy has both the rows that still
-- reference the backed-up tables and the BKP434_ backups with the original incomplete rows.
-- The scheduler job is not copied, so nothing changes projections during the rehearsal.
-- Next: run tests/restore_rehearsal.sql connected as CLEANUP_REHEARSAL. When done, as ADMIN:
--   DROP USER CLEANUP_REHEARSAL CASCADE;
SET SERVEROUTPUT ON

DECLARE
    v_file VARCHAR2(60) := 'rehearsal434_' || TO_CHAR(SYSDATE, 'YYYYMMDD_HH24MISS');
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
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'SCHEMA_EXPR', 'IN (''DEVELOPMENT'')');
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'NAME_EXPR', 'NOT LIKE ''DBTOOLS$%''', 'TABLE');
    pin_to_current_scn(v_job);
    run_job(v_job, 'Export ' || v_file || '.dmp');

    v_job := DBMS_DATAPUMP.OPEN(operation => 'IMPORT', job_mode => 'SCHEMA');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '.dmp', 'DATA_PUMP_DIR');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '_import.log', 'DATA_PUMP_DIR',
                           filetype => DBMS_DATAPUMP.KU$_FILE_TYPE_LOG_FILE);
    DBMS_DATAPUMP.METADATA_REMAP(v_job, 'REMAP_SCHEMA', 'DEVELOPMENT', 'CLEANUP_REHEARSAL');
    -- The user already exists; grants and the scheduler job (PROCOBJ) are not part of the rehearsal.
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'EXCLUDE_PATH_EXPR',
        'IN (''USER'', ''SYSTEM_GRANT'', ''ROLE_GRANT'', ''DEFAULT_ROLE'', ''TABLESPACE_QUOTA'', ''OBJECT_GRANT'', ''PROCOBJ'')');
    DBMS_DATAPUMP.SET_PARAMETER(v_job, 'TABLE_EXISTS_ACTION', 'REPLACE');
    run_job(v_job, 'Import into CLEANUP_REHEARSAL', 'ORA-31684');
END;
/
