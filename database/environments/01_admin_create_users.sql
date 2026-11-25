-- SCRUM-435: prepares the DEVELOPMENT schema and the least-privilege app user CINETADEL_APP.
-- Runs in the Database Actions SQL worksheet (Run Script, F5) or SQL Developer, as ADMIN.
--
-- First create both users with their passwords, so no password is ever written in a script:
--   Database Actions > Administration > Database Users > + Create User
--   1. User Name DEVELOPMENT, its password, Quota on tablespace DATA: UNLIMITED. Turn Web Access on
--      (alias 'development') so the team can open Database Actions with it.
--   2. User Name CINETADEL_APP, its password. Leave Web Access off: only the server uses it. The form also grants it
--      CONNECT and RESOURCE; this script revokes them.
-- Autonomous Database passwords: 12-30 characters, upper and lower case letters and a number,
-- no double quotes and not containing the user name.
-- (SQL Developer alternative: CREATE USER DEVELOPMENT IDENTIFIED BY "<password>"; and the same for
--  CINETADEL_APP, typed in the worksheet without saving it.)

-- Same roles and quota as the PRODUCTION owner, so the copy in 02 can recreate every object.
ALTER USER DEVELOPMENT DEFAULT TABLESPACE DATA QUOTA UNLIMITED ON DATA;
GRANT CONNECT, RESOURCE TO DEVELOPMENT;

-- Only connects. Table access is granted in 03_admin_grant_app_user.sql.
GRANT CREATE SESSION TO CINETADEL_APP;
-- The Create User form grants CONNECT and RESOURCE by default; RESOURCE would allow DDL.
BEGIN
    FOR r IN (SELECT GRANTED_ROLE FROM DBA_ROLE_PRIVS WHERE GRANTEE = 'CINETADEL_APP') LOOP
        EXECUTE IMMEDIATE 'REVOKE "' || r.GRANTED_ROLE || '" FROM CINETADEL_APP';
    END LOOP;
END;
/
ALTER USER CINETADEL_APP QUOTA 0 ON DATA;

-- Expected: PRODUCTION, DEVELOPMENT and CINETADEL_APP, all OPEN.
SELECT USERNAME, ACCOUNT_STATUS, DEFAULT_TABLESPACE
  FROM DBA_USERS
 WHERE USERNAME IN ('PRODUCTION', 'DEVELOPMENT', 'CINETADEL_APP')
 ORDER BY USERNAME;

-- Expected: CINETADEL_APP only has CREATE SESSION; DEVELOPMENT has CONNECT and RESOURCE.
SELECT GRANTEE, PRIVILEGE AS GRANTED FROM DBA_SYS_PRIVS WHERE GRANTEE IN ('DEVELOPMENT', 'CINETADEL_APP')
UNION ALL
SELECT GRANTEE, GRANTED_ROLE FROM DBA_ROLE_PRIVS WHERE GRANTEE IN ('DEVELOPMENT', 'CINETADEL_APP')
ORDER BY 1, 2;
