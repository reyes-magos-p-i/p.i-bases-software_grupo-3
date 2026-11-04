import type { Connection } from 'oracledb';
import { linkAllMoviesToBranch, linkMovieToAllBranches } from './cinema-movies';

describe('cinema movie links', () => {
  const execute = jest.fn();
  const connection = { execute } as unknown as Connection;

  beforeEach(() => execute.mockReset().mockResolvedValue({ rowsAffected: 3 }));

  it('links a new movie to every branch inside the caller transaction', async () => {
    await linkMovieToAllBranches(connection, 24);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /INSERT INTO CINEMA_MOVIES \(BRANCH_ID, MOVIE_ID, IS_AVAILABLE\)\s+SELECT BRANCH_ID, :movieId, 1 FROM CINEMAS/,
      ),
      { movieId: 24 },
      { autoCommit: false },
    );
  });

  it('links every movie to a new branch inside the caller transaction', async () => {
    await linkAllMoviesToBranch(connection, 30);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /INSERT INTO CINEMA_MOVIES \(BRANCH_ID, MOVIE_ID, IS_AVAILABLE\)\s+SELECT :branchId, MOVIE_ID, 1 FROM MOVIES/,
      ),
      { branchId: 30 },
      { autoCommit: false },
    );
  });
});
