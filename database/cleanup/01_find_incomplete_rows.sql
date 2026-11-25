-- SCRUM-434: lists the records whose mandatory columns are NULL or blank (spaces only).
-- Run as the schema owner (DEVELOPMENT or PRODUCTION) with Ctrl+Enter. Read-only.
-- Run it before the cleanup to keep the list, and after it: only the PENDIENTE rows remain.
--
-- "Mandatory" means what the app requires today (create DTOs, triggers and dashboard lists),
-- not only the NOT NULL constraints. Nulls that are valid by design are not listed:
--   CLIENTS optional profile fields (second name, surnames, birthday, phone, gender, address),
--   INVOICES Stripe/card columns of SIMULATED payments and REQUEST_KEY/BUYER_EMAIL/PURCHASE_CONTEXT
--   of client invoices created before the purchase flow (the API falls back to the client data),
--   PRODUCTS.PRICE of TICKET products (priced by the function), PRODUCTS.CODE of FOOD products,
--   EMPLOYEE_LOCAL_CREDENTIALS.PASSWORD_SET_AT (NULL forces a password change on the next login).
-- SEATS and INVOICE_PRODUCTS were reviewed too: every column there is NOT NULL.
WITH no_credentials AS (
    SELECT e.EMPLOYEE_ID,
           CASE WHEN EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS f JOIN INVOICES i ON i.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
                              WHERE f.CREATED_BY = e.EMPLOYEE_ID)
                  OR EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS f JOIN TICKETS k ON k.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
                              WHERE f.CREATED_BY = e.EMPLOYEE_ID AND k.INVOICE_ID IS NOT NULL)
                THEN 1 ELSE 0 END AS HAS_PURCHASES
      FROM EMPLOYEES e
     WHERE NOT EXISTS (SELECT 1 FROM EMPLOYEE_LOCAL_CREDENTIALS c WHERE c.EMPLOYEE_ID = e.EMPLOYEE_ID)
),
-- Movies without a poster are fictional test data (seed 20261027). Purchases made through the app
-- count as real; only the seed's invoices (Stripe intent pi_seed_...) do not.
posterless_movies AS (
    SELECT m.MOVIE_ID,
           CASE WHEN EXISTS (SELECT 1 FROM MOVIE_FUNCTIONS f JOIN INVOICES i ON i.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
                              WHERE f.MOVIE_ID = m.MOVIE_ID
                                AND (i.STRIPE_PAYMENT_INTENT_ID IS NULL
                                     OR i.STRIPE_PAYMENT_INTENT_ID NOT LIKE 'pi\_seed\_%' ESCAPE '\'))
                THEN 1 ELSE 0 END AS HAS_REAL_PURCHASES
      FROM MOVIES m
     WHERE TRIM(m.POSTER_IMAGE) IS NULL
)
SELECT 'COMPANIES' AS TABLE_NAME, c.COMPANY_ID AS RECORD_ID, 'NAME' AS EMPTY_COLUMNS,
       (SELECT COUNT(*) FROM CINEMAS b WHERE b.COMPANY_ID = c.COMPANY_ID) || ' sucursales' AS RELATED_DATA,
       CASE WHEN EXISTS (SELECT 1 FROM CINEMAS b WHERE b.COMPANY_ID = c.COMPANY_ID)
            THEN 'PENDIENTE: tiene sucursales' ELSE 'ELIMINAR' END AS ACTION
  FROM COMPANIES c
 WHERE TRIM(c.NAME) IS NULL
UNION ALL
SELECT 'CINEMAS', b.BRANCH_ID, 'NAME',
       (SELECT COUNT(*) FROM THEATERS t WHERE t.BRANCH_ID = b.BRANCH_ID) || ' salas',
       'PENDIENTE: definir el nombre'
  FROM CINEMAS b
 WHERE TRIM(b.NAME) IS NULL
UNION ALL
SELECT 'CLIENTS', c.CLIENT_ID,
       LTRIM(CASE WHEN TRIM(c.EMAIL) IS NULL THEN ', EMAIL' END
             || CASE WHEN TRIM(c.FIRST_NAME) IS NULL THEN ', FIRST_NAME' END
             || CASE WHEN c.CREATED_AT IS NULL THEN ', CREATED_AT' END, ', '),
       (SELECT COUNT(*) FROM INVOICES i WHERE i.CLIENT_ID = c.CLIENT_ID) || ' compras',
       CASE WHEN TRIM(c.EMAIL) IS NULL OR TRIM(c.FIRST_NAME) IS NULL THEN 'PENDIENTE: completar a mano'
            ELSE 'COMPLETAR: fecha de su actividad más antigua' END
  FROM CLIENTS c
 WHERE TRIM(c.EMAIL) IS NULL OR TRIM(c.FIRST_NAME) IS NULL OR c.CREATED_AT IS NULL
UNION ALL
SELECT 'EMPLOYEES', e.EMPLOYEE_ID,
       LTRIM(CASE WHEN n.EMPLOYEE_ID IS NOT NULL THEN ', credenciales' END
             || CASE WHEN TRIM(e.FIRST_NAME) IS NULL THEN ', FIRST_NAME' END
             || CASE WHEN TRIM(e.FIRST_SURNAME) IS NULL THEN ', FIRST_SURNAME' END
             || CASE WHEN e.CREATED_AT IS NULL THEN ', CREATED_AT' END
             || CASE WHEN e.HIRE_DATE IS NULL THEN ', HIRE_DATE' END, ', '),
       (SELECT COUNT(*) FROM MOVIE_FUNCTIONS f WHERE f.CREATED_BY = e.EMPLOYEE_ID) || ' proyecciones creadas',
       CASE WHEN n.HAS_PURCHASES = 1 THEN 'PENDIENTE: sus proyecciones tienen compras'
            WHEN n.EMPLOYEE_ID IS NOT NULL THEN 'ELIMINAR: con sus proyecciones'
            WHEN TRIM(e.FIRST_NAME) IS NULL OR TRIM(e.FIRST_SURNAME) IS NULL THEN 'PENDIENTE: completar a mano'
            ELSE 'COMPLETAR: fecha de su actividad más antigua' END
  FROM EMPLOYEES e
  LEFT JOIN no_credentials n ON n.EMPLOYEE_ID = e.EMPLOYEE_ID
 WHERE n.EMPLOYEE_ID IS NOT NULL OR TRIM(e.FIRST_NAME) IS NULL OR TRIM(e.FIRST_SURNAME) IS NULL
    OR e.CREATED_AT IS NULL OR e.HIRE_DATE IS NULL
UNION ALL
SELECT 'MOVIES', m.MOVIE_ID,
       LTRIM(CASE WHEN TRIM(m.TITLE) IS NULL THEN ', TITLE' END
             || CASE WHEN TRIM(m.SYNOPSIS) IS NULL THEN ', SYNOPSIS' END
             || CASE WHEN TRIM(m.POSTER_IMAGE) IS NULL THEN ', POSTER_IMAGE' END
             || CASE WHEN m.CLASSIFICATION_ID IS NULL THEN ', CLASSIFICATION_ID' END, ', '),
       (SELECT COUNT(*) FROM MOVIE_FUNCTIONS f WHERE f.MOVIE_ID = m.MOVIE_ID) || ' proyecciones, '
       || (SELECT COUNT(*) FROM MOVIE_FUNCTIONS f JOIN INVOICES i ON i.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
            WHERE f.MOVIE_ID = m.MOVIE_ID) || ' compras',
       CASE WHEN p.HAS_REAL_PURCHASES = 0 THEN 'ELIMINAR: película de prueba, con sus proyecciones y compras de prueba'
            WHEN p.HAS_REAL_PURCHASES = 1 THEN 'PENDIENTE: película sin póster con compras reales'
            ELSE 'PENDIENTE: completar en Películas > Editar' END
  FROM MOVIES m
  LEFT JOIN posterless_movies p ON p.MOVIE_ID = m.MOVIE_ID
 WHERE TRIM(m.TITLE) IS NULL OR TRIM(m.SYNOPSIS) IS NULL OR TRIM(m.POSTER_IMAGE) IS NULL OR m.CLASSIFICATION_ID IS NULL
UNION ALL
SELECT 'THEATERS', t.THEATER_ID, 'DIMENSION_X, DIMENSION_Y',
       (SELECT COUNT(*) FROM MOVIE_FUNCTIONS f WHERE f.THEATER_ID = t.THEATER_ID) || ' proyecciones',
       'PENDIENTE: definir las dimensiones'
  FROM THEATERS t
 WHERE t.DIMENSION_X IS NULL OR t.DIMENSION_Y IS NULL
UNION ALL
SELECT 'MOVIE_FUNCTIONS', f.MOVIE_FUNCTION_ID,
       NVL(LTRIM(CASE WHEN f.PRICE IS NULL THEN ', PRICE' END
                 || CASE WHEN f.PROJECTION_FORMAT IS NULL THEN ', PROJECTION_FORMAT' END
                 || CASE WHEN f.TECHNOLOGY IS NULL THEN ', TECHNOLOGY' END
                 || CASE WHEN f.IS_PREMIERE IS NULL THEN ', IS_PREMIERE' END, ', '),
           '(de una película de prueba o de un empleado sin credenciales)'),
       (SELECT COUNT(*) FROM INVOICES i WHERE i.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID) || ' compras, '
       || (SELECT COUNT(*) FROM TICKETS k WHERE k.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID) || ' boletos',
       CASE WHEN p.HAS_REAL_PURCHASES = 0 THEN 'ELIMINAR: es de una película de prueba sin póster'
            WHEN n.HAS_PURCHASES = 0 THEN 'ELIMINAR: la creó un empleado sin credenciales'
            WHEN f.PRICE IS NULL THEN 'PENDIENTE: definir el precio'
            ELSE 'COMPLETAR: 2D, STANDARD, sin estreno' END
  FROM MOVIE_FUNCTIONS f
  LEFT JOIN no_credentials n ON n.EMPLOYEE_ID = f.CREATED_BY
  LEFT JOIN posterless_movies p ON p.MOVIE_ID = f.MOVIE_ID
 WHERE f.PRICE IS NULL OR f.PROJECTION_FORMAT IS NULL OR f.TECHNOLOGY IS NULL OR f.IS_PREMIERE IS NULL
    OR n.HAS_PURCHASES = 0 OR p.HAS_REAL_PURCHASES = 0
UNION ALL
SELECT 'PRODUCTS', p.PRODUCT_ID, CASE WHEN p.PRODUCT_TYPE = 'FOOD' THEN 'PRICE' ELSE 'CODE' END,
       (SELECT COUNT(*) FROM INVOICE_PRODUCTS l WHERE l.PRODUCT_ID = p.PRODUCT_ID) || ' ventas',
       'PENDIENTE: completar a mano'
  FROM PRODUCTS p
 WHERE TRIM(p.NAME) IS NULL
    OR (p.PRODUCT_TYPE = 'FOOD' AND p.PRICE IS NULL)
    OR (p.PRODUCT_TYPE = 'TICKET' AND TRIM(p.CODE) IS NULL)
UNION ALL
SELECT 'INVOICES', i.INVOICE_ID, 'CLIENT_ID, BUYER_EMAIL',
       (SELECT COUNT(*) FROM TICKETS k WHERE k.INVOICE_ID = i.INVOICE_ID) || ' boletos',
       'PENDIENTE: compra sin comprador'
  FROM INVOICES i
 WHERE i.CLIENT_ID IS NULL AND TRIM(i.BUYER_EMAIL) IS NULL
UNION ALL
SELECT 'INVOICES', i.INVOICE_ID, '(compra de prueba de una película sin póster)',
       i.STATUS || ', ' || (SELECT COUNT(*) FROM INVOICE_PRODUCTS l WHERE l.INVOICE_ID = i.INVOICE_ID) || ' líneas',
       'ELIMINAR: compra de prueba del seed'
  FROM INVOICES i
  JOIN MOVIE_FUNCTIONS f ON f.MOVIE_FUNCTION_ID = i.MOVIE_FUNCTION_ID
  JOIN posterless_movies p ON p.MOVIE_ID = f.MOVIE_ID AND p.HAS_REAL_PURCHASES = 0
UNION ALL
SELECT 'TICKETS', k.TICKETS_ID, 'INVOICE_ID, PRODUCT_ID',
       'proyección ' || k.MOVIE_FUNCTION_ID || ' (' || f.STATUS || ')',
       'ELIMINAR: boleto sin compra'
  FROM TICKETS k
  JOIN MOVIE_FUNCTIONS f ON f.MOVIE_FUNCTION_ID = k.MOVIE_FUNCTION_ID
 WHERE k.INVOICE_ID IS NULL
 ORDER BY 1, 2;
