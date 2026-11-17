-- SCRUM-434: completes or deletes the incomplete records listed by 01, in one transaction.
-- Run as the schema owner (DEVELOPMENT or PRODUCTION, never CINETADEL_APP) with Run Script (F5),
-- first in DEVELOPMENT and, once validated there, unchanged in PRODUCTION (compare the file hash).
-- It stops without changes if 02 has not created the backups, and rolls back everything on error.
-- Records with real purchases are never deleted: 01 keeps listing them as PENDIENTE.
SET SERVEROUTPUT ON

-- Autonomous Database runs DML in parallel by default on the HIGH and MEDIUM services. This script
-- deletes and then updates the same tables in one transaction, which parallel DML can't do: a
-- parallel server ends up waiting forever on a row lock held by its own session.
ALTER SESSION DISABLE PARALLEL DML;

DECLARE
    backups NUMBER;

    PROCEDURE report(p_step VARCHAR2) IS
    BEGIN
        DBMS_OUTPUT.PUT_LINE(RPAD(p_step, 62, '.') || ' ' || SQL%ROWCOUNT);
    END;
BEGIN
    SELECT COUNT(*) INTO backups FROM USER_TABLES
     WHERE TABLE_NAME IN ('BKP434_COMPANIES', 'BKP434_CLIENTS', 'BKP434_EMPLOYEES',
                          'BKP434_PASSWORD_RECOVERIES', 'BKP434_MOVIES', 'BKP434_MOVIE_GENRES',
                          'BKP434_MOVIE_LANGUAGES', 'BKP434_CINEMA_MOVIES', 'BKP434_MOVIE_FUNCTIONS',
                          'BKP434_MOVIE_FUNCTIONS_ACTIVITIES', 'BKP434_TICKETS', 'BKP434_INVOICES',
                          'BKP434_INVOICE_PRODUCTS', 'BKP434_PURCHASE_TICKET_EMAILS');
    IF backups <> 14 THEN
        RAISE_APPLICATION_ERROR(-20434, 'Faltan respaldos BKP434_. Ejecuta 02 antes de la limpieza.');
    END IF;

    -- 1. Tickets without a purchase, left by the purchase flow before migration 20261101.
    --    Nothing references them, and they hold seats and block editing their projection.
    DELETE FROM TICKETS WHERE INVOICE_ID IS NULL AND PRODUCT_ID IS NULL;
    report('Boletos sin compra eliminados');

    -- 1b. Movies without a poster are fictional test data (seed 20261027). They go with their
    --     projections and the seed's test purchases (Stripe intent pi_seed_...). A movie with any
    --     other purchase is kept, and 01 lists it as PENDIENTE.
    FOR m IN (SELECT MOVIE_ID FROM MOVIES x
               WHERE TRIM(x.POSTER_IMAGE) IS NULL
                 AND NOT EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS f JOIN INVOICES i ON i.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
                                  WHERE f.MOVIE_ID = x.MOVIE_ID
                                    AND (i.STRIPE_PAYMENT_INTENT_ID IS NULL
                                         OR i.STRIPE_PAYMENT_INTENT_ID NOT LIKE 'pi\_seed\_%' ESCAPE '\'))) LOOP
        DELETE FROM TICKETS
         WHERE MOVIE_FUNCTION_ID IN (SELECT MOVIE_FUNCTION_ID FROM MOVIE_FUNCTIONS WHERE MOVIE_ID = m.MOVIE_ID);
        report('Boletos de la película ' || m.MOVIE_ID);
        DELETE FROM PURCHASE_TICKET_EMAILS
         WHERE INVOICE_ID IN (SELECT i.INVOICE_ID FROM INVOICES i JOIN MOVIE_FUNCTIONS f ON f.MOVIE_FUNCTION_ID = i.MOVIE_FUNCTION_ID
                               WHERE f.MOVIE_ID = m.MOVIE_ID);
        report('Correos de boletos de la película ' || m.MOVIE_ID);
        DELETE FROM INVOICE_PRODUCTS
         WHERE INVOICE_ID IN (SELECT i.INVOICE_ID FROM INVOICES i JOIN MOVIE_FUNCTIONS f ON f.MOVIE_FUNCTION_ID = i.MOVIE_FUNCTION_ID
                               WHERE f.MOVIE_ID = m.MOVIE_ID);
        report('Líneas de compras de prueba de la película ' || m.MOVIE_ID);
        DELETE FROM INVOICES
         WHERE MOVIE_FUNCTION_ID IN (SELECT MOVIE_FUNCTION_ID FROM MOVIE_FUNCTIONS WHERE MOVIE_ID = m.MOVIE_ID);
        report('Compras de prueba de la película ' || m.MOVIE_ID);
        DELETE FROM MOVIE_FUNCTIONS_ACTIVITIES
         WHERE MOVIE_FUNCTION_ID IN (SELECT MOVIE_FUNCTION_ID FROM MOVIE_FUNCTIONS WHERE MOVIE_ID = m.MOVIE_ID);
        report('Actividades de proyecciones de la película ' || m.MOVIE_ID);
        DELETE FROM MOVIE_FUNCTIONS WHERE MOVIE_ID = m.MOVIE_ID;
        report('Proyecciones de la película ' || m.MOVIE_ID);
        DELETE FROM CINEMA_MOVIES WHERE MOVIE_ID = m.MOVIE_ID;
        report('Sucursales de la película ' || m.MOVIE_ID);
        DELETE FROM MOVIE_GENRES WHERE MOVIE_ID = m.MOVIE_ID;
        DELETE FROM MOVIE_LANGUAGES WHERE MOVIE_ID = m.MOVIE_ID;
        DELETE FROM MOVIES WHERE MOVIE_ID = m.MOVIE_ID;
        report('Película de prueba sin póster ' || m.MOVIE_ID);
    END LOOP;

    -- 2. Employees without credentials can't sign in. They go with every projection they created,
    --    unless one of those projections has purchases (then 01 lists the employee as PENDIENTE).
    FOR e IN (SELECT EMPLOYEE_ID FROM EMPLOYEES x
               WHERE NOT EXISTS (SELECT 1 FROM EMPLOYEE_LOCAL_CREDENTIALS c WHERE c.EMPLOYEE_ID = x.EMPLOYEE_ID)
                 AND NOT EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS f JOIN INVOICES i ON i.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
                                  WHERE f.CREATED_BY = x.EMPLOYEE_ID)
                 AND NOT EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS f JOIN TICKETS k ON k.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
                                  WHERE f.CREATED_BY = x.EMPLOYEE_ID)) LOOP
        DELETE FROM MOVIE_FUNCTIONS_ACTIVITIES
         WHERE CREATED_BY = e.EMPLOYEE_ID
            OR MOVIE_FUNCTION_ID IN (SELECT MOVIE_FUNCTION_ID FROM MOVIE_FUNCTIONS WHERE CREATED_BY = e.EMPLOYEE_ID);
        report('Actividades de proyecciones del empleado ' || e.EMPLOYEE_ID);
        DELETE FROM MOVIE_FUNCTIONS WHERE CREATED_BY = e.EMPLOYEE_ID;
        report('Proyecciones del empleado ' || e.EMPLOYEE_ID);
        DELETE FROM PASSWORD_RECOVERIES WHERE EMPLOYEE_ID = e.EMPLOYEE_ID;
        report('Recuperaciones de contraseña del empleado ' || e.EMPLOYEE_ID);
        DELETE FROM EMPLOYEES WHERE EMPLOYEE_ID = e.EMPLOYEE_ID;
        report('Empleado sin credenciales ' || e.EMPLOYEE_ID);
    END LOOP;

    -- 3. Companies whose name is only spaces and that have no branches.
    DELETE FROM COMPANIES c
     WHERE TRIM(c.NAME) IS NULL
       AND NOT EXISTS (SELECT 1 FROM CINEMAS b WHERE b.COMPANY_ID = c.COMPANY_ID);
    report('Empresas sin nombre eliminadas');

    -- 4. Projections created before migration 20261101 added format, technology and premiere.
    --    They get the values of a regular projection: 2D, standard technology, not a premiere.
    UPDATE MOVIE_FUNCTIONS
       SET PROJECTION_FORMAT = NVL(PROJECTION_FORMAT, '2D'),
           TECHNOLOGY = NVL(TECHNOLOGY, 'STANDARD'),
           IS_PREMIERE = NVL(IS_PREMIERE, 0)
     WHERE PROJECTION_FORMAT IS NULL OR TECHNOLOGY IS NULL OR IS_PREMIERE IS NULL;
    report('Proyecciones completadas (formato, tecnología, estreno)');

    -- 5. Clients without a registration date (TRG_CLIENTS_REQUIRED_DATES requires it now):
    --    the oldest date of their activity (terms, credentials, purchases); now if there is none.
    UPDATE CLIENTS c
       SET CREATED_AT = (
           SELECT NVL(MIN(d.EVENT_AT), SYSTIMESTAMP)
             FROM (SELECT c.ACCEPTED_TERMS_AT AS EVENT_AT FROM DUAL
                   UNION ALL SELECT l.PASSWORD_SET_AT FROM CLIENT_LOCAL_CREDENTIALS l WHERE l.CLIENT_ID = c.CLIENT_ID
                   UNION ALL SELECT FROM_TZ(x.CREATED_AT, 'UTC') FROM CLIENT_EXTERNAL_CREDENTIALS x
                              WHERE x.CLIENT_ID = c.CLIENT_ID
                   UNION ALL SELECT i.CREATED_AT FROM INVOICES i WHERE i.CLIENT_ID = c.CLIENT_ID) d)
     WHERE c.CREATED_AT IS NULL;
    report('Clientes con fecha de registro completada');

    -- 6. Employees without registration or hire date (TRG_EMPLOYEES_REQUIRED_DATES requires both):
    --    registration = oldest activity (password, projections created); hire date = that day.
    UPDATE EMPLOYEES e
       SET CREATED_AT = (
           SELECT NVL(MIN(d.EVENT_AT), SYSTIMESTAMP)
             FROM (SELECT l.PASSWORD_SET_AT AS EVENT_AT FROM EMPLOYEE_LOCAL_CREDENTIALS l WHERE l.EMPLOYEE_ID = e.EMPLOYEE_ID
                   UNION ALL SELECT f.CREATED_AT FROM MOVIE_FUNCTIONS f WHERE f.CREATED_BY = e.EMPLOYEE_ID) d)
     WHERE e.CREATED_AT IS NULL;
    report('Empleados con fecha de registro completada');

    UPDATE EMPLOYEES
       SET HIRE_DATE = TRUNC(CAST(CREATED_AT AT TIME ZONE 'America/Costa_Rica' AS DATE))
     WHERE HIRE_DATE IS NULL;
    report('Empleados con fecha de contratación completada');

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Limpieza confirmada. Ejecuta 01: solo deben quedar filas PENDIENTE.');
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/
