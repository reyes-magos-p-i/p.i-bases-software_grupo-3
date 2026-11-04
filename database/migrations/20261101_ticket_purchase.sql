-- SCRUM-29: reproduce the ticket-purchase schema already deployed in Oracle.
-- Run as the application owner, or set CURRENT_SCHEMA to that owner first.
-- Save and run this file as UTF-8.
-- Requires the existing sales, seats and tickets tables. DDL commits implicitly;
-- apply before deploying the API, with application writes stopped.
-- Existing purchase metadata, configured functions and historical invoices stay intact.

WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

DECLARE
    v_owner VARCHAR2(128) := SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA');
    v_count NUMBER;
    v_nullable VARCHAR2(1);

    PROCEDURE ensure_column(p_table VARCHAR2, p_column VARCHAR2, p_definition VARCHAR2) IS
        v_exists NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_exists
          FROM ALL_TAB_COLUMNS
         WHERE OWNER = v_owner AND TABLE_NAME = p_table AND COLUMN_NAME = p_column;
        IF v_exists = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE ' || p_table || ' ADD (' || p_column || ' ' || p_definition || ')';
        END IF;
    END;

    PROCEDURE ensure_constraint(p_table VARCHAR2, p_name VARCHAR2, p_definition VARCHAR2) IS
        v_exists NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_exists
          FROM ALL_CONSTRAINTS
         WHERE OWNER = v_owner AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name;
        IF v_exists = 0 THEN
            EXECUTE IMMEDIATE 'ALTER TABLE ' || p_table || ' ADD CONSTRAINT ' || p_name || ' ' || p_definition;
        END IF;
    END;

BEGIN
    SELECT COUNT(*) INTO v_count FROM ALL_TABLES
     WHERE OWNER = v_owner AND TABLE_NAME IN
           ('MOVIES', 'MOVIE_FUNCTIONS', 'PRODUCTS', 'INVOICES', 'INVOICE_PRODUCTS', 'TICKETS');
    IF v_count <> 6 THEN
        RAISE_APPLICATION_ERROR(-20011, 'Apply the prerequisite cinema, sales and ticket schemas first.');
    END IF;

    SELECT COUNT(*) INTO v_count FROM ALL_TAB_COLUMNS
     WHERE OWNER = v_owner AND TABLE_NAME = 'MOVIES' AND COLUMN_NAME = 'SYNOPSIS'
       AND CHAR_USED = 'C' AND CHAR_LENGTH >= 1000;
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE MOVIES MODIFY (SYNOPSIS VARCHAR2(1000 CHAR))';
    END IF;

    ensure_column('MOVIE_FUNCTIONS', 'PROJECTION_FORMAT', 'VARCHAR2(2 BYTE)');
    ensure_column('MOVIE_FUNCTIONS', 'TECHNOLOGY', 'VARCHAR2(8 BYTE)');
    ensure_column('MOVIE_FUNCTIONS', 'IS_PREMIERE', 'NUMBER(1)');
    ensure_constraint('MOVIE_FUNCTIONS', 'CHK_MF_FORMAT',
        q'[CHECK (PROJECTION_FORMAT IN ('2D','3D'))]');
    ensure_constraint('MOVIE_FUNCTIONS', 'CHK_MF_TECHNOLOGY',
        q'[CHECK (TECHNOLOGY IN ('STANDARD','IMAX','70MM'))]');
    ensure_constraint('MOVIE_FUNCTIONS', 'CHK_MF_PREMIERE',
        'CHECK (IS_PREMIERE IN (0,1))');
    ensure_constraint('MOVIE_FUNCTIONS', 'CHK_MF_FORMAT_TECH',
        q'[CHECK (TECHNOLOGY <> '70MM' OR PROJECTION_FORMAT <> '3D')]');

    ensure_column('PRODUCTS', 'CODE', 'VARCHAR2(40 BYTE)');
    ensure_constraint('PRODUCTS', 'UQ_PRODUCT_CODE', 'UNIQUE (CODE)');

    ensure_column('INVOICES', 'REQUEST_KEY', 'VARCHAR2(36 BYTE)');
    ensure_column('INVOICES', 'REQUEST_HASH', 'VARCHAR2(64 BYTE)');
    ensure_column('INVOICES', 'BUYER_EMAIL', 'VARCHAR2(150 BYTE)');
    ensure_column('INVOICES', 'PURCHASE_CONTEXT', 'CLOB');
    ensure_constraint('INVOICES', 'UQ_INVOICE_REQUEST', 'UNIQUE (REQUEST_KEY)');
    ensure_constraint('INVOICES', 'CHK_INVOICE_REQUEST',
        'CHECK ((REQUEST_KEY IS NULL AND REQUEST_HASH IS NULL) OR (REQUEST_KEY IS NOT NULL AND REQUEST_HASH IS NOT NULL))');
    ensure_constraint('INVOICES', 'CHK_INVOICE_CONTEXT', 'CHECK (PURCHASE_CONTEXT IS JSON)');
    ensure_constraint('INVOICES', 'CHK_INVOICE_BUYER',
        'CHECK (CLIENT_ID IS NOT NULL OR BUYER_EMAIL IS NOT NULL)');

    SELECT NULLABLE INTO v_nullable FROM ALL_TAB_COLUMNS
     WHERE OWNER = v_owner AND TABLE_NAME = 'INVOICES' AND COLUMN_NAME = 'CLIENT_ID';
    IF v_nullable = 'N' THEN
        EXECUTE IMMEDIATE 'ALTER TABLE INVOICES MODIFY (CLIENT_ID NULL)';
    END IF;

    -- Install the replacement before dropping the old check, retaining CARD/CASH rules.
    ensure_constraint('INVOICES', 'CHK_INVOICE_PAYMENT_V2', q'[
        CHECK ((payment_method='CARD' AND stripe_payment_intent_id IS NOT NULL
                AND stripe_livemode IN (0,1)
                AND (status <> 'PAID' OR (card_brand IS NOT NULL AND card_last4 IS NOT NULL)))
            OR (payment_method IN ('CASH','SIMULATED') AND status IN ('PAID','CANCELLED')
                AND stripe_payment_intent_id IS NULL AND stripe_livemode IS NULL
                AND card_brand IS NULL AND card_last4 IS NULL))]');
    SELECT COUNT(*) INTO v_count FROM ALL_CONSTRAINTS
     WHERE OWNER = v_owner AND TABLE_NAME = 'INVOICES' AND CONSTRAINT_NAME = 'CHK_INVOICE_PAYMENT';
    IF v_count > 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE INVOICES DROP CONSTRAINT CHK_INVOICE_PAYMENT';
    END IF;

    SELECT COUNT(*) INTO v_count FROM ALL_TAB_COLUMNS
     WHERE OWNER = v_owner AND TABLE_NAME = 'INVOICE_PRODUCTS' AND COLUMN_NAME = 'QUANTITY'
       AND DATA_TYPE = 'NUMBER' AND (DATA_PRECISION >= 5 OR DATA_PRECISION IS NULL)
       AND (DATA_SCALE = 0 OR DATA_SCALE IS NULL);
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'ALTER TABLE INVOICE_PRODUCTS MODIFY (QUANTITY NUMBER(5))';
    END IF;

    ensure_column('TICKETS', 'INVOICE_ID', 'NUMBER');
    ensure_column('TICKETS', 'PRODUCT_ID', 'NUMBER');
    ensure_constraint('TICKETS', 'CHK_TICKET_INVOICE_PRODUCT',
        'CHECK ((INVOICE_ID IS NULL AND PRODUCT_ID IS NULL) OR (INVOICE_ID IS NOT NULL AND PRODUCT_ID IS NOT NULL))');
    ensure_constraint('TICKETS', 'FK_TICKET_INVOICE',
        'FOREIGN KEY (INVOICE_ID) REFERENCES INVOICES (INVOICE_ID)');
    ensure_constraint('TICKETS', 'FK_TICKET_INVOICE_PRODUCT',
        'FOREIGN KEY (INVOICE_ID, PRODUCT_ID) REFERENCES INVOICE_PRODUCTS (INVOICE_ID, PRODUCT_ID)');
    SELECT COUNT(*) INTO v_count FROM ALL_INDEXES
     WHERE OWNER = v_owner AND TABLE_NAME = 'TICKETS' AND INDEX_NAME = 'IX_TICKET_INVOICE_PRODUCT';
    IF v_count = 0 THEN
        EXECUTE IMMEDIATE 'CREATE INDEX IX_TICKET_INVOICE_PRODUCT ON TICKETS (INVOICE_ID, PRODUCT_ID)';
    END IF;

END;
/

-- Compile data initialization after the new columns have been created.
DECLARE
    PROCEDURE ensure_ticket_product(p_code VARCHAR2, p_name VARCHAR2) IS
        v_exists NUMBER;
        v_valid NUMBER;
    BEGIN
        SELECT COUNT(*), COUNT(CASE WHEN PRODUCT_TYPE = 'TICKET' AND PRICE IS NULL THEN 1 END)
          INTO v_exists, v_valid
          FROM PRODUCTS WHERE CODE = p_code;
        IF v_exists > 0 THEN
            IF v_valid <> 1 THEN
                RAISE_APPLICATION_ERROR(-20010, 'A ticket code is assigned to an incompatible product: ' || p_code);
            END IF;
            RETURN;
        END IF;
        UPDATE PRODUCTS SET CODE = p_code
         WHERE NAME = p_name AND PRODUCT_TYPE = 'TICKET' AND CODE IS NULL;
        IF SQL%ROWCOUNT = 0 THEN
            INSERT INTO PRODUCTS (NAME, PRODUCT_TYPE, PRICE, CODE)
            VALUES (p_name, 'TICKET', NULL, p_code);
        END IF;
    END;
BEGIN
    ensure_ticket_product('TICKET_GENERAL_STANDARD', 'Boleto general');
    ensure_ticket_product('TICKET_GENERAL_VIP', 'Boleto general VIP');
    ensure_ticket_product('TICKET_CHILD_STANDARD', 'Boleto niño');
    ensure_ticket_product('TICKET_CHILD_VIP', 'Boleto niño VIP');
    ensure_ticket_product('TICKET_SENIOR_STANDARD', 'Boleto adulto mayor');
    ensure_ticket_product('TICKET_SENIOR_VIP', 'Boleto adulto mayor VIP');

    -- Only initialize previously unconfigured future functions; retain historical prices.
    MERGE INTO MOVIE_FUNCTIONS target
    USING (
        SELECT mf.MOVIE_FUNCTION_ID,
               CASE WHEN UPPER(p.NAME) LIKE '%IMAX%' THEN 'IMAX'
                    WHEN REGEXP_LIKE(UPPER(p.NAME), '70[[:space:]]*MM') THEN '70MM'
                    ELSE 'STANDARD' END AS TECHNOLOGY
          FROM MOVIE_FUNCTIONS mf
          JOIN THEATERS t ON t.THEATER_ID = mf.THEATER_ID
          JOIN PROJECTORS p ON p.PROJECTOR_ID = t.PROJECTOR_ID
         WHERE mf.START_TIME > CAST(SYSTIMESTAMP AT TIME ZONE 'America/Costa_Rica' AS TIMESTAMP)
           AND mf.PROJECTION_FORMAT IS NULL AND mf.TECHNOLOGY IS NULL AND mf.IS_PREMIERE IS NULL
    ) source ON (target.MOVIE_FUNCTION_ID = source.MOVIE_FUNCTION_ID)
    WHEN MATCHED THEN UPDATE SET
        target.PROJECTION_FORMAT = '2D', target.TECHNOLOGY = source.TECHNOLOGY,
        target.IS_PREMIERE = 0,
        target.PRICE = 3000 + CASE source.TECHNOLOGY WHEN 'IMAX' THEN 1000 WHEN '70MM' THEN 500 ELSE 0 END;
END;
/
COMMIT;
