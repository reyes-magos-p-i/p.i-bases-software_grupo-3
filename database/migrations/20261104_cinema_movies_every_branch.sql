-- Projections, the portal and purchases only offer a movie in the branches linked
-- to it. Only the 2026-10-07 seed created links, when a single branch existed.
-- The API now links new movies and branches; this adds the links that are missing.
-- Existing links are kept, including the ones marked unavailable.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

INSERT INTO CINEMA_MOVIES (BRANCH_ID, MOVIE_ID, IS_AVAILABLE)
SELECT c.BRANCH_ID, m.MOVIE_ID, 1
  FROM CINEMAS c CROSS JOIN MOVIES m
 WHERE NOT EXISTS (SELECT 1 FROM CINEMA_MOVIES cm
                    WHERE cm.BRANCH_ID = c.BRANCH_ID AND cm.MOVIE_ID = m.MOVIE_ID);
COMMIT;
