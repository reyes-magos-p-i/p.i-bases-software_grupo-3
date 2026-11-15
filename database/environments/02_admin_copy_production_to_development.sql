-- SCRUM-435: copies the PRODUCTION schema (structure and data) into DEVELOPMENT with Data Pump.
-- Run as ADMIN after 01. It only reads PRODUCTION. Running it again refreshes DEVELOPMENT:
-- its tables are replaced with the current production ones, so anything created only in
-- DEVELOPMENT is lost. The dump file stays in DATA_PUMP_DIR and doubles as a backup.
-- Copied: tables and data, indexes, constraints, identity columns, the
-- REFRESH_MOVIE_FUNCTION_STATUS procedure, the triggers and MOVIE_FUNCTION_STATUS_JOB.
-- Not copied: the user itself, grants to other users and SQL Developer Web tables (DBTOOLS$).

DECLARE
    v_file  VARCHAR2(60) := 'production_' || TO_CHAR(SYSDATE, 'YYYYMMDD_HH24MISS');
    v_job   NUMBER;
    v_state VARCHAR2(30);
BEGIN
    v_job := DBMS_DATAPUMP.OPEN(operation => 'EXPORT', job_mode => 'SCHEMA');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '.dmp', 'DATA_PUMP_DIR');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '_export.log', 'DATA_PUMP_DIR',
                           filetype => DBMS_DATAPUMP.KU$_FILE_TYPE_LOG_FILE);
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'SCHEMA_EXPR', 'IN (''PRODUCTION'')');
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'NAME_EXPR', 'NOT LIKE ''DBTOOLS$%''', 'TABLE');
    DBMS_DATAPUMP.START_JOB(v_job);
    DBMS_DATAPUMP.WAIT_FOR_JOB(v_job, v_state);
    DBMS_OUTPUT.PUT_LINE('Export ' || v_file || '.dmp: ' || v_state);
    IF v_state <> 'COMPLETED' THEN
        RAISE_APPLICATION_ERROR(-20001, 'The export ended as ' || v_state);
    END IF;

    v_job := DBMS_DATAPUMP.OPEN(operation => 'IMPORT', job_mode => 'SCHEMA');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '.dmp', 'DATA_PUMP_DIR');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '_import.log', 'DATA_PUMP_DIR',
                           filetype => DBMS_DATAPUMP.KU$_FILE_TYPE_LOG_FILE);
    DBMS_DATAPUMP.METADATA_REMAP(v_job, 'REMAP_SCHEMA', 'PRODUCTION', 'DEVELOPMENT');
    -- DEVELOPMENT already exists (01) and must not get the grants given to CINETADEL_APP.
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'EXCLUDE_PATH_EXPR',
        'IN (''USER'', ''SYSTEM_GRANT'', ''ROLE_GRANT'', ''DEFAULT_ROLE'', ''TABLESPACE_QUOTA'', ''OBJECT_GRANT'')');
    DBMS_DATAPUMP.SET_PARAMETER(v_job, 'TABLE_EXISTS_ACTION', 'REPLACE');
    DBMS_DATAPUMP.START_JOB(v_job);
    DBMS_DATAPUMP.WAIT_FOR_JOB(v_job, v_state);
    DBMS_OUTPUT.PUT_LINE('Import into DEVELOPMENT: ' || v_state);
    IF v_state <> 'COMPLETED' THEN
        RAISE_APPLICATION_ERROR(-20002, 'The import ended as ' || v_state);
    END IF;
END;
/

-- Files and logs of this copy (read a log with DBMS_CLOUD or download it from Database Actions).
SELECT OBJECT_NAME, BYTES, LAST_MODIFIED
  FROM DBMS_CLOUD.LIST_FILES('DATA_PUMP_DIR')
 WHERE OBJECT_NAME LIKE 'production_%'
 ORDER BY LAST_MODIFIED DESC;

-- Next step: 04_admin_compare_schemas.sql must return no rows.
