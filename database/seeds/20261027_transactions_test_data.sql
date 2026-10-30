-- =========================================================
-- Test data for SCRUM-17 / SCRUM-18 (transactions) and SCRUM-347.
-- Requires: migrations/20261016_sales_invoices_products.sql
--
-- Run connected as PRODUCTION (or with CURRENT_SCHEMA = PRODUCTION) and
-- save it as UTF-8. It can be run more than once: each MERGE only inserts
-- the missing rows. Values match the test plan (UT-043 to UT-057): five
-- invoices, FAC-000121 to FAC-000125.
--
-- Notes:
-- - The clients are created without a password. Logging in as them is
--   prepared with the purchase history data (SCRUM-347).
-- - THEATER_ID is GENERATED ALWAYS, so the plan's "Sala 2" cannot be
--   created with ID 2. "La Última Frontera" uses the first theater after
--   theater 1 (today Sala 63); "Ecos del Volcán" uses theater 1 (Sala 1).
-- - Card payments use Stripe test cards; only the brand and the last 4
--   digits are stored. The payment intent IDs are placeholders.
-- =========================================================

-- Movies of the test plan
MERGE INTO Movies m
USING (
    SELECT 'La Última Frontera' title, 125 running_time, 2026 release_year,
           'Una tripulación viaja al borde del sistema solar en busca de un nuevo hogar.' synopsis
      FROM dual
    UNION ALL
    SELECT 'Ecos del Volcán', 110, 2026,
           'Una vulcanóloga descubre un secreto bajo el volcán Irazú.'
      FROM dual
) s
ON (m.title = s.title)
WHEN NOT MATCHED THEN
    INSERT (title, running_time, synopsis, release_year)
    VALUES (s.title, s.running_time, s.synopsis, s.release_year);

-- Clients that own the invoices (names as in the test plan)
MERGE INTO Clients c
USING (
    SELECT 'cliente.pruebas@cinetadel.shop' email, 'María' first_name, 'Rodríguez' first_surname FROM dual
    UNION ALL SELECT 'cliente2.pruebas@cinetadel.shop', 'Carlos', 'Mora' FROM dual
    UNION ALL SELECT 'cliente4.pruebas@cinetadel.shop', 'Ana', 'Solís' FROM dual
) s
ON (c.email = s.email)
WHEN NOT MATCHED THEN
    INSERT (email, first_name, first_surname)
    VALUES (s.email, s.first_name, s.first_surname);

-- Products: the ticket takes the function price; food has a catalog price
MERGE INTO Products p
USING (
    SELECT 'Boleto general' name, 'TICKET' product_type, CAST(NULL AS NUMBER) price FROM dual
    UNION ALL SELECT 'Combo palomitas y refresco', 'FOOD', 4500 FROM dual
    UNION ALL SELECT 'Refresco mediano', 'FOOD', 1000 FROM dual
) s
ON (p.name = s.name)
WHEN NOT MATCHED THEN
    INSERT (name, product_type, price)
    VALUES (s.name, s.product_type, s.price);

-- Finished functions of the five purchases (₡3500 each)
MERGE INTO Movie_functions f
USING (
    SELECT m.movie_id, t.theater_id, s.start_time,
           s.start_time + NUMTODSINTERVAL(m.running_time, 'MINUTE') end_time
      FROM (
            SELECT 'La Última Frontera' title, 2 sala, TIMESTAMP '2026-10-05 19:30:00' start_time FROM dual
            UNION ALL SELECT 'Ecos del Volcán', 1, TIMESTAMP '2026-10-10 17:00:00' FROM dual
            UNION ALL SELECT 'Ecos del Volcán', 1, TIMESTAMP '2026-10-12 17:00:00' FROM dual
            UNION ALL SELECT 'La Última Frontera', 2, TIMESTAMP '2026-10-14 21:00:00' FROM dual
            UNION ALL SELECT 'La Última Frontera', 2, TIMESTAMP '2026-10-16 21:00:00' FROM dual
           ) s
      JOIN Movies m ON m.title = s.title
      JOIN Theaters t
        ON t.theater_id = CASE s.sala
                              WHEN 1 THEN 1
                              ELSE (SELECT MIN(theater_id) FROM Theaters WHERE theater_id > 1)
                          END
) s
ON (f.movie_id = s.movie_id AND f.theater_id = s.theater_id
    AND f.start_time = s.start_time AND f.end_time = s.end_time)
WHEN NOT MATCHED THEN
    INSERT (movie_id, theater_id, start_time, end_time, screening_date, created_by, price, status)
    VALUES (s.movie_id, s.theater_id, s.start_time, s.end_time, TRUNC(s.start_time),
            (SELECT MIN(employee_id) FROM Employees
              WHERE role = 'ADMINISTRATOR' AND status = 'ACTIVE'),
            3500, 'FINISHED');

-- Invoices FAC-000121 to FAC-000125 (paid by card in Stripe test mode)
MERGE INTO Invoices i
USING (
    SELECT s.invoice_id, c.client_id, f.movie_function_id, s.created_at, s.status,
           s.card_brand, s.card_last4, s.total
      FROM (
            SELECT 121 invoice_id, 'cliente.pruebas@cinetadel.shop' email, 'La Última Frontera' title,
                   TIMESTAMP '2026-10-05 19:30:00' start_time,
                   TIMESTAMP '2026-10-05 10:42:00 America/Costa_Rica' created_at,
                   'PAID' status, 'visa' card_brand, '4242' card_last4, 7000 total FROM dual
            UNION ALL SELECT 122, 'cliente.pruebas@cinetadel.shop', 'Ecos del Volcán',
                   TIMESTAMP '2026-10-10 17:00:00', TIMESTAMP '2026-10-10 10:42:00 America/Costa_Rica',
                   'CANCELLED', 'visa', '4242', 11500 FROM dual
            UNION ALL SELECT 123, 'cliente2.pruebas@cinetadel.shop', 'Ecos del Volcán',
                   TIMESTAMP '2026-10-12 17:00:00', TIMESTAMP '2026-10-12 10:42:00 America/Costa_Rica',
                   'PAID', 'mastercard', '4444', 3500 FROM dual
            UNION ALL SELECT 124, 'cliente.pruebas@cinetadel.shop', 'La Última Frontera',
                   TIMESTAMP '2026-10-14 21:00:00', TIMESTAMP '2026-10-14 10:42:00 America/Costa_Rica',
                   'PAID', 'visa', '4242', 4500 FROM dual
            UNION ALL SELECT 125, 'cliente4.pruebas@cinetadel.shop', 'La Última Frontera',
                   TIMESTAMP '2026-10-16 21:00:00', TIMESTAMP '2026-10-16 10:42:00 America/Costa_Rica',
                   'CANCELLED', 'mastercard', '8210', 3500 FROM dual
           ) s
      JOIN Clients c ON c.email = s.email
      JOIN Movies m ON m.title = s.title
      JOIN Movie_functions f ON f.movie_id = m.movie_id AND f.start_time = s.start_time
) s
ON (i.invoice_id = s.invoice_id)
WHEN NOT MATCHED THEN
    INSERT (invoice_id, client_id, movie_function_id, created_at, status, payment_method,
            stripe_payment_intent_id, stripe_livemode, card_brand, card_last4, total)
    VALUES (s.invoice_id, s.client_id, s.movie_function_id, s.created_at, s.status, 'CARD',
            'pi_seed_fac_' || LPAD(s.invoice_id, 6, '0'), 0, s.card_brand, s.card_last4, s.total);

-- Invoice lines (the ticket costs what the function costs: ₡3500)
MERGE INTO Invoice_products l
USING (
    SELECT s.invoice_id, p.product_id, s.quantity, s.unit_price
      FROM (
            SELECT 121 invoice_id, 'Boleto general' name, 2 quantity, 3500 unit_price FROM dual
            UNION ALL SELECT 122, 'Boleto general', 2, 3500 FROM dual
            UNION ALL SELECT 122, 'Combo palomitas y refresco', 1, 4500 FROM dual
            UNION ALL SELECT 123, 'Boleto general', 1, 3500 FROM dual
            UNION ALL SELECT 124, 'Boleto general', 1, 3500 FROM dual
            UNION ALL SELECT 124, 'Refresco mediano', 1, 1000 FROM dual
            UNION ALL SELECT 125, 'Boleto general', 1, 3500 FROM dual
           ) s
      JOIN Products p ON p.name = s.name
      JOIN Invoices i ON i.invoice_id = s.invoice_id
) s
ON (l.invoice_id = s.invoice_id AND l.product_id = s.product_id)
WHEN NOT MATCHED THEN
    INSERT (invoice_id, product_id, quantity, unit_price)
    VALUES (s.invoice_id, s.product_id, s.quantity, s.unit_price);

COMMIT;

-- The invoice IDs above were given by hand; move the identity past them so
-- new purchases do not collide with FAC-000121 to FAC-000125.
ALTER TABLE Invoices MODIFY invoice_id GENERATED BY DEFAULT AS IDENTITY (START WITH LIMIT VALUE);
