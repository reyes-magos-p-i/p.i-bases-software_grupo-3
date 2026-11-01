-- =========================================================
-- SCRUM-32 / SCRUM-33: two active branches cannot share a name
--
-- Run connected as PRODUCTION (or with CURRENT_SCHEMA = PRODUCTION), after
-- 20261016_cinemas_status.sql. Save and run this file as UTF-8.
--
-- The API already rejects a repeated name before saving; this index covers two
-- requests that save the same name at the same time. Names are compared without
-- case, accents or outer spaces, with the same expression the API uses.
-- Inactive branches and names made only of spaces are not indexed, so a
-- deactivated branch frees its name.
--
-- Check first that no active names repeat (it must return no rows):
--   SELECT TRANSLATE(LOWER(TRIM(name)), 'áéíóúüñ', 'aeiouun') AS name_key, COUNT(*)
--   FROM Cinemas WHERE status = 'ACTIVE' AND TRIM(name) IS NOT NULL
--   GROUP BY TRANSLATE(LOWER(TRIM(name)), 'áéíóúüñ', 'aeiouun') HAVING COUNT(*) > 1;
-- =========================================================

CREATE UNIQUE INDEX ux_cinemas_active_name ON Cinemas (
    CASE WHEN status = 'ACTIVE'
         THEN TRANSLATE(LOWER(TRIM(name)), 'áéíóúüñ', 'aeiouun')
    END
);
