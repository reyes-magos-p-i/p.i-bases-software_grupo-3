--================================================================
-- SCRUM-321 Clientes - Anuncios promocionales por correo
-- Adds the client opt-in flag for the monthly promotions email.
-- Clients start opted out and can enable it at any time from their profile.
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
