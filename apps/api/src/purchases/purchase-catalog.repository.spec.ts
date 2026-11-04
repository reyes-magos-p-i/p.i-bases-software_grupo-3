import type oracle from 'oracledb';
import {
  PurchaseCatalogRepository,
  seatQuery,
  toPurchaseFunction,
} from './purchase-catalog.repository';
import type { DatabaseService } from '../database/database.service';
const row = {
  id: 4,
  movieId: 2,
  title: 'Película',
  format: '2D',
  technology: 'STANDARD',
  isPremiere: 0,
  available: 1,
} as const;
describe('Purchase catalog repository', () => {
  const db = { query: jest.fn() },
    connection = { execute: jest.fn() };
  const repo = new PurchaseCatalogRepository(db as unknown as DatabaseService);
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it('returns existing movies and null for unknown identifiers', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({});
    expect(await repo.getMovie(2)).toEqual({ id: 2 });
    expect(await repo.getMovie(3)).toBeNull();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE MOVIE_ID=:id'),
      { id: 3 },
    );
  });
  it('offers only available functions and normalizes pricing settings', async () => {
    db.query.mockResolvedValue({
      rows: [row, { ...row, id: 5, available: 0 }],
    });
    expect(await repo.getFunctions(2)).toEqual([
      expect.objectContaining({
        id: 4,
        price: 3000,
        isPremiere: false,
        available: true,
      }),
    ]);
    expect(db.query.mock.calls[0][0]).toContain(
      "AT TIME ZONE 'America/Costa_Rica'",
    );
    expect(db.query.mock.calls[0][0]).toContain("c.STATUS='ACTIVE'");
    expect(db.query.mock.calls[0][0]).toContain('EXISTS(SELECT 1 FROM SEATS s');
    expect(db.query.mock.calls[0][0]).toContain("s.SEAT_STATE='libre'");
    expect(db.query.mock.calls[0][0]).toContain(
      'NOT EXISTS(SELECT 1 FROM TICKETS tk',
    );
    expect(db.query.mock.calls[0][0]).toContain(
      'tk.MOVIE_FUNCTION_ID=mf.MOVIE_FUNCTION_ID',
    );
    expect(db.query.mock.calls[0][0]).toContain(
      's.ROW_NUMBER BETWEEN 1 AND t.DIMENSION_X',
    );
    expect(db.query.mock.calls[0][0]).toContain(
      's.COLUMN_NUMBER BETWEEN 1 AND t.DIMENSION_Y',
    );
  });
  it('handles empty results and reads through an existing transaction', async () => {
    db.query.mockResolvedValue({});
    connection.execute.mockResolvedValue({
      rows: [{ ...row, isPremiere: 1, available: 0 }],
    });
    expect(await repo.getFunctions(2)).toEqual([]);
    expect(await repo.getFunction(4)).toBeNull();
    expect(await repo.getFunction(4, connection as never)).toMatchObject({
      isPremiere: true,
      available: false,
    });
    expect(toPurchaseFunction({ ...row, isPremiere: 0 } as never).price).toBe(
      3000,
    );
    connection.execute.mockResolvedValue({});
    expect(await repo.getFunction(8, connection as never)).toBeNull();
  });
  const settings = {
    rows: [
      { key: 'MAX_TICKETS_PER_FUNCTION', value: 6 },
      { key: 'MAX_GUEST_PURCHASES_PER_HOUR', value: 2 },
    ],
  };
  it('reads the limits from the database, also inside a transaction', async () => {
    db.query.mockResolvedValue(settings);
    expect(await repo.getLimits()).toEqual({
      maxTickets: 6,
      maxGuestPurchases: 2,
    });
    connection.execute.mockResolvedValue(settings);
    expect(
      await repo.getLimits(connection as unknown as oracle.Connection),
    ).toEqual({ maxTickets: 6, maxGuestPurchases: 2 });
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('FROM GLOBAL_SETTINGS'),
      {},
      expect.objectContaining({ autoCommit: false }),
    );
  });
  it.each([
    { rows: [] },
    {},
    { rows: [{ key: 'MAX_TICKETS_PER_FUNCTION', value: 6 }] },
    { rows: [{ key: 'MAX_GUEST_PURCHASES_PER_HOUR', value: 2 }] },
  ])('refuses to sell without both limits %j', async (result) => {
    db.query.mockResolvedValue(result);
    await expect(repo.getLimits()).rejects.toMatchObject({ status: 503 });
  });
  it('overlays tickets per function and respects inaccessible physical seats', async () => {
    let seatResult: object = {
      rows: [{ positionId: 1, state: 'in-use' }],
    };
    db.query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('GLOBAL_SETTINGS') ? settings : seatResult),
    );
    const context = { id: 4, theaterId: 3, columns: 2 } as never;
    expect(await repo.getSeats(context)).toMatchObject({
      maxTickets: 6,
      seats: [{ state: 'in-use' }],
      categories: expect.any(Array),
    });
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('tk.MOVIE_FUNCTION_ID=:functionId'),
      { columns: 2, theaterId: 3, functionId: 4 },
    );
    seatResult = {};
    expect(await repo.getSeats(context)).toMatchObject({ seats: [] });
    expect(seatQuery([1, 2])).toContain('IN (:p0,:p1)');
    expect(seatQuery([1])).toContain('FOR UPDATE');
    expect(seatQuery()).not.toContain('FOR UPDATE');
    expect(seatQuery()).toContain(
      'JOIN THEATERS t ON t.THEATER_ID=s.THEATER_ID',
    );
    expect(seatQuery()).toContain('s.ROW_NUMBER BETWEEN 1 AND t.DIMENSION_X');
    expect(seatQuery([1])).toContain(
      's.COLUMN_NUMBER BETWEEN 1 AND t.DIMENSION_Y',
    );
  });
});
