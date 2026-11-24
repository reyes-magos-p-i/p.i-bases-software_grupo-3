--================================================================
-- SCRUM-321 Clientes - Anuncios promocionales por correo
-- Adds the client opt-in flag for the monthly promotions email and the table that
-- records each monthly send, so a restart or a missed day cannot send it twice.
-- Clients start opted out and can enable it at any time from their profile.
-- Re-run database/environments/03_admin_grant_app_user.sql afterwards so CINETADEL_APP can use the new table.
--===================================================================
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM USER_TAB_COLUMNS
     WHERE TABLE_NAME = 'CLIENTS'
       AND COLUMN_NAME = 'PROMO_EMAIL_OPT_IN';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
            ALTER TABLE CLIENTS ADD (
                PROMO_EMAIL_OPT_IN NUMBER(1) DEFAULT 0 NOT NULL,
                CONSTRAINT CK_CLIENTS_PROMO_EMAIL_OPT_IN CHECK (PROMO_EMAIL_OPT_IN IN (0, 1))
            )]';
    END IF;
END;
/

DECLARE
    v_count NUMBER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM ALL_TABLES
     WHERE OWNER = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
       AND TABLE_NAME = 'PROMOTIONAL_EMAIL_RUNS';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE q'[
            CREATE TABLE PROMOTIONAL_EMAIL_RUNS (
                MONTH_KEY CHAR(7 BYTE) NOT NULL,
                CLAIMED_AT TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
                CONSTRAINT PK_PROMOTIONAL_EMAIL_RUNS PRIMARY KEY (MONTH_KEY)
            )]';
    END IF;
END;
/
