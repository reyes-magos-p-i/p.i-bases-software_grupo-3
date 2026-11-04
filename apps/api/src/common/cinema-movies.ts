import type { Connection } from 'oracledb';

// Projections, the portal and purchases only offer a movie in the branches
// linked to it, so new movies and new branches are linked to every counterpart.

export async function linkMovieToAllBranches(
  connection: Connection,
  movieId: number,
): Promise<void> {
  await connection.execute(
    `INSERT INTO CINEMA_MOVIES (BRANCH_ID, MOVIE_ID, IS_AVAILABLE)
     SELECT BRANCH_ID, :movieId, 1 FROM CINEMAS`,
    { movieId },
    { autoCommit: false },
  );
}

export async function linkAllMoviesToBranch(
  connection: Connection,
  branchId: number,
): Promise<void> {
  await connection.execute(
    `INSERT INTO CINEMA_MOVIES (BRANCH_ID, MOVIE_ID, IS_AVAILABLE)
     SELECT :branchId, MOVIE_ID, 1 FROM MOVIES`,
    { branchId },
    { autoCommit: false },
  );
}
