-- SCRUM-436: indexes on the foreign keys that the API joins or filters on and that had none.
-- Apply as the schema owner (DEVELOPMENT first, then PRODUCTION) with Run Script (F5). It can be
-- run again: an index that already exists is skipped. ONLINE keeps the tables writable while each
-- index is built. Measurements: docs/query-optimization.md.
--   INVOICES(MOVIE_FUNCTION_ID)   transactions filters and detail, purchases of a projection
--   THEATERS(BRANCH_ID)           projections, theaters and the ticket purchase catalog
--   MOVIE_FUNCTIONS(CREATED_BY)   without it, deleting or updating an employee locks the whole table
--   CINEMA_MOVIES(MOVIE_ID)       availability of a movie per branch
--   EMPLOYEES(BRANCH_ID)          users list filtered by branch
--   MOVIE_GENRES(GENRE_ID)        movies by genre (filters and recommendations)
SET SERVEROUTPUT ON

DECLARE
    PROCEDURE ensure_index(p_name VARCHAR2, p_table VARCHAR2, p_columns VARCHAR2) IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_count FROM USER_INDEXES WHERE INDEX_NAME = p_name;
        IF v_count = 0 THEN
            EXECUTE IMMEDIATE 'CREATE INDEX ' || p_name || ' ON ' || p_table || ' (' || p_columns || ') ONLINE';
            DBMS_OUTPUT.PUT_LINE('Creado ' || p_name);
        ELSE
            DBMS_OUTPUT.PUT_LINE('Ya existía ' || p_name);
        END IF;
    END;
BEGIN
    ensure_index('IX_INVOICES_FUNCTION', 'INVOICES', 'MOVIE_FUNCTION_ID');
    ensure_index('IX_THEATERS_BRANCH', 'THEATERS', 'BRANCH_ID');
    ensure_index('IX_MOVIE_FUNCTIONS_CREATED_BY', 'MOVIE_FUNCTIONS', 'CREATED_BY');
    ensure_index('IX_CINEMA_MOVIES_MOVIE', 'CINEMA_MOVIES', 'MOVIE_ID');
    ensure_index('IX_EMPLOYEES_BRANCH', 'EMPLOYEES', 'BRANCH_ID');
    ensure_index('IX_MOVIE_GENRES_GENRE', 'MOVIE_GENRES', 'GENRE_ID');
END;
/

SELECT INDEX_NAME, TABLE_NAME, STATUS FROM USER_INDEXES
 WHERE INDEX_NAME IN ('IX_INVOICES_FUNCTION', 'IX_THEATERS_BRANCH', 'IX_MOVIE_FUNCTIONS_CREATED_BY',
                      'IX_CINEMA_MOVIES_MOVIE', 'IX_EMPLOYEES_BRANCH', 'IX_MOVIE_GENRES_GENRE')
 ORDER BY INDEX_NAME;
