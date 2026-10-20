-- =========================================================
-- Stub data to test SCRUM-42..45 (test environments only).
-- Requires: database/migrations/20261007_movie_functions_scheduling.sql
-- =========================================================

-- Test movies (POSTER_IMAGE is served from /api/image/<file>)
MERGE INTO Movies m
USING (
    SELECT 'Spider-Man: Brand New Day' title, 150 running_time, 2026 release_year,
           'Peter Parker enfrenta una nueva amenaza en Nueva York.' synopsis,
           'spiderman-brand-new-day.jpg' poster_image FROM dual
    UNION ALL
    SELECT 'The Odyssey', 170, 2026,
           'Odiseo emprende el largo regreso a Ítaca tras la guerra de Troya.',
           'the-odyssey.jpg' FROM dual
    UNION ALL
    SELECT 'Project Hail Mary', 156, 2026,
           'Un astronauta despierta solo en una misión para salvar la Tierra.',
           'project-hail-mary.jpg' FROM dual
    UNION ALL
    SELECT 'The Godfather', 175, 1972,
           'La familia Corleone lucha por mantener su poder.',
           'the-godfather.jpg' FROM dual
) s
ON (m.title = s.title)
WHEN NOT MATCHED THEN
    INSERT (title, running_time, synopsis, poster_image, release_year)
    VALUES (s.title, s.running_time, s.synopsis, s.poster_image, s.release_year);

-- Every movie is available in every branch, except 'The Godfather'
-- in the first branch (to test the "unavailable" case).
MERGE INTO Cinema_movies cm
USING (
    SELECT c.branch_id, m.movie_id,
           CASE WHEN m.title = 'The Godfather'
                 AND c.branch_id = (SELECT MIN(branch_id) FROM Cinemas)
                THEN 0 ELSE 1 END is_available
      FROM Cinemas c CROSS JOIN Movies m
) s
ON (cm.branch_id = s.branch_id AND cm.movie_id = s.movie_id)
WHEN NOT MATCHED THEN
    INSERT (branch_id, movie_id, is_available)
    VALUES (s.branch_id, s.movie_id, s.is_available);

-- Default form durations
MERGE INTO Activities a
USING (
    SELECT 'Limpieza (30 min)' name, 30 duration_minutes, 'CLEANING' type FROM dual
    UNION ALL
    SELECT 'Anuncios (15 min)', 15, 'ADVERTISEMENT' FROM dual
) s
ON (a.type = s.type AND a.duration_minutes = s.duration_minutes)
WHEN NOT MATCHED THEN
    INSERT (name, duration_minutes, type)
    VALUES (s.name, s.duration_minutes, s.type);

COMMIT;
