-- SCRUM-435: backs up the PRODUCTION schema (structure and data) to DATA_PUMP_DIR.
-- Run as ADMIN before applying migrations or data cleanups to PRODUCTION.
-- Restore a table only if something went wrong, as ADMIN, with DBMS_DATAPUMP import of the file
-- (TABLE_EXISTS_ACTION = REPLACE and a NAME_EXPR filter on that table).

DECLARE
    v_file  VARCHAR2(60) := 'backup_production_' || TO_CHAR(SYSDATE, 'YYYYMMDD_HH24MISS');
    v_job   NUMBER;
    v_state VARCHAR2(30);
BEGIN
    v_job := DBMS_DATAPUMP.OPEN(operation => 'EXPORT', job_mode => 'SCHEMA');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '.dmp', 'DATA_PUMP_DIR');
    DBMS_DATAPUMP.ADD_FILE(v_job, v_file || '.log', 'DATA_PUMP_DIR',
                           filetype => DBMS_DATAPUMP.KU$_FILE_TYPE_LOG_FILE);
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'SCHEMA_EXPR', 'IN (''PRODUCTION'')');
    DBMS_DATAPUMP.METADATA_FILTER(v_job, 'NAME_EXPR', 'NOT LIKE ''DBTOOLS$%''', 'TABLE');
    DBMS_DATAPUMP.START_JOB(v_job);
    DBMS_DATAPUMP.WAIT_FOR_JOB(v_job, v_state);
    DBMS_OUTPUT.PUT_LINE('Backup ' || v_file || '.dmp: ' || v_state);
    IF v_state <> 'COMPLETED' THEN
        RAISE_APPLICATION_ERROR(-20001, 'The backup ended as ' || v_state);
    END IF;
END;
/

SELECT OBJECT_NAME, BYTES, LAST_MODIFIED
  FROM DBMS_CLOUD.LIST_FILES('DATA_PUMP_DIR')
 WHERE OBJECT_NAME LIKE 'backup_production_%'
 ORDER BY LAST_MODIFIED DESC;
