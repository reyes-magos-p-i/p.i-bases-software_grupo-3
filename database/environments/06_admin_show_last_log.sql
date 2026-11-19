-- SCRUM-435: shows the newest Data Pump log in DATA_PUMP_DIR (copy, import or backup).
-- Run as ADMIN in the SQL worksheet; the LOG_TEXT cell holds the whole file.
-- The last lines say "successfully completed" or "completed with N error(s)".
SELECT OBJECT_NAME,
       TO_CLOB(BFILENAME('DATA_PUMP_DIR', OBJECT_NAME), NLS_CHARSET_ID('AL32UTF8'), 'text/plain') AS LOG_TEXT
  FROM (SELECT OBJECT_NAME FROM DBMS_CLOUD.LIST_FILES('DATA_PUMP_DIR')
         WHERE OBJECT_NAME LIKE '%.log'
         ORDER BY LAST_MODIFIED DESC)
 WHERE ROWNUM = 1;
