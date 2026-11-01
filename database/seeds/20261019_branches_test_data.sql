-- =========================================================
-- Test data for the branch stories SCRUM-32..35 (test environments only).
-- Requires: database/migrations/20261016_cinemas_status.sql
--
-- Can be run more than once: each MERGE only inserts the missing rows.
-- Names and companies match the test plan (UT-016 to UT-023).
-- Names and companies are NOT NULL, so an "empty" value is a text of
-- only spaces. The UI treats it as missing and shows an alert.
-- =========================================================

-- Companies. Every test company reuses the address of the first company.
MERGE INTO Companies p
USING (
    SELECT v.name, a.id_address
      FROM (SELECT 'Cinetadel S.A' name FROM dual
            UNION ALL SELECT 'Cinetadel del Pacifico' FROM dual
            UNION ALL SELECT 'Cinetadel del Caribe' FROM dual
            -- UT-022 and UT-023: a company without a name (3 spaces)
            UNION ALL SELECT '   ' FROM dual) v
     CROSS JOIN (SELECT id_address FROM Companies
                  WHERE company_id = (SELECT MIN(company_id) FROM Companies)) a
) s
ON (p.name = s.name)
WHEN NOT MATCHED THEN
    INSERT (name, id_address) VALUES (s.name, s.id_address);

-- Active branches. A branch is identified by its name and company.
MERGE INTO Cinemas c
USING (
    SELECT v.name, p.company_id
      FROM (SELECT 'Sucursal Heredia Centro' name, 'Cinetadel S.A' company FROM dual
            UNION ALL SELECT 'Sucursal Heredia Oeste', 'Cinetadel del Pacifico' FROM dual
            -- UT-018: name with the maximum length (50 characters)
            UNION ALL SELECT 'Sucursal Gran Centro Comercial Heredia Norte Oeste', 'Cinetadel S.A' FROM dual
            -- UT-019: accents and ñ
            UNION ALL SELECT 'Sucursal Peñas Blancas San Ramón', 'Cinetadel del Pacifico' FROM dual
            -- UT-021: branch without a name (3 spaces)
            UNION ALL SELECT '   ', 'Cinetadel del Caribe' FROM dual
            -- UT-022: company without a name
            UNION ALL SELECT 'Sucursal Sin Compania', '   ' FROM dual
            -- UT-023: neither name nor company
            UNION ALL SELECT '   ', '   ' FROM dual) v
      JOIN (SELECT name, MIN(company_id) company_id FROM Companies GROUP BY name) p
        ON p.name = v.company
) s
ON (c.name = s.name AND c.company_id = s.company_id)
WHEN NOT MATCHED THEN
    INSERT (name, company_id, status) VALUES (s.name, s.company_id, 'ACTIVE');

COMMIT;
