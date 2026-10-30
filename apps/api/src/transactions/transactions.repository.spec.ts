import oracle from 'oracledb';
import type { DatabaseService } from '../database/database.service';
import type { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import {
  TransactionsRepository,
  type TransactionRow,
} from './transactions.repository';

describe('TransactionsRepository', () => {
  const db = { query: jest.fn() };
  const repository = new TransactionsRepository(
    db as unknown as DatabaseService,
  );
  const query: ListTransactionsQueryDto = { page: 1, pageSize: 10 };
  const row: TransactionRow = {
    ID: 123,
    PURCHASED_AT: '2026-10-12T10:42',
    CLIENT_NAME: 'Carlos Mora',
    CLIENT_EMAIL: 'cliente2.pruebas@cinetadel.shop',
    MOVIE_TITLE: 'Ecos del Volcán',
    BRANCH_NAME: 'Cinetadel Multiplaza del Este',
    THEATER_ID: 1,
    FUNCTION_START: '2026-10-12T17:00',
    TICKETS: 1,
    TOTAL: 3500,
    STATUS: 'PAID',
  };
  const call = (index: number) =>
    db.query.mock.calls[index] as [
      string,
      Record<string, { val: unknown; type: unknown }>,
    ];
  const mockList = (total: number, rows: TransactionRow[] = []) =>
    db.query
      .mockResolvedValueOnce({ rows: [{ TOTAL: total }] })
      .mockResolvedValueOnce({ rows });

  beforeEach(() => db.query.mockReset());

  describe('listTransactions', () => {
    it('lists paid and cancelled invoices, newest first, one page at a time', async () => {
      mockList(1, [row]);
      await expect(repository.listTransactions(query)).resolves.toEqual({
        items: [
          {
            id: 123,
            purchasedAt: '2026-10-12T10:42',
            clientName: 'Carlos Mora',
            clientEmail: 'cliente2.pruebas@cinetadel.shop',
            movieTitle: 'Ecos del Volcán',
            branchName: 'Cinetadel Multiplaza del Este',
            theaterId: 1,
            functionStart: '2026-10-12T17:00',
            tickets: 1,
            total: 3500,
            status: 'PAID',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
      const [countSql, countBinds] = call(0);
      expect(countSql).toContain("i.STATUS IN ('PAID', 'CANCELLED')");
      expect(countBinds).toEqual({});
      const [sql, binds] = call(1);
      expect(sql).toContain("AT TIME ZONE 'America/Costa_Rica'");
      expect(sql).toContain("p.PRODUCT_TYPE = 'TICKET'");
      expect(sql).toContain('ORDER BY i.CREATED_AT DESC, i.INVOICE_ID DESC');
      expect(binds).toEqual({
        offset: { val: 0, type: oracle.NUMBER },
        pageSize: { val: 10, type: oracle.NUMBER },
      });
    });

    it('moves a page beyond the last one back to the last page', async () => {
      mockList(21, [row]);
      const result = await repository.listTransactions({
        page: 9,
        pageSize: 10,
      });
      expect(result.page).toBe(3);
      expect(call(1)[1].offset).toEqual({ val: 20, type: oracle.NUMBER });
    });

    it('skips the page query when nothing matches', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      await expect(repository.listTransactions(query)).resolves.toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('treats a missing page result as empty', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ TOTAL: 1 }] })
        .mockResolvedValueOnce({});
      const result = await repository.listTransactions(query);
      expect(result.items).toEqual([]);
    });

    it('searches client, email and movie ignoring case, accents and LIKE wildcards', async () => {
      mockList(0);
      await repository.listTransactions({ ...query, search: 'Volcán 50%_' });
      const [sql, binds] = call(0);
      expect(sql).toContain(
        "TRANSLATE(LOWER(m.TITLE), 'áéíóúüñ', 'aeiouun') LIKE :search",
      );
      expect(sql).toContain("LOWER(c.EMAIL) LIKE :search ESCAPE '\\'");
      expect(sql).not.toContain(':invoiceId');
      expect(binds).toEqual({
        search: { val: '%volcan 50\\%\\_%', type: oracle.STRING },
      });
    });

    it.each([
      ['FAC-000123', 123],
      ['fac123', 123],
      ['000123', 123],
      ['7', 7],
    ])('also matches the invoice ID when searching %p', async (search, id) => {
      mockList(0);
      await repository.listTransactions({ ...query, search });
      const [sql, binds] = call(0);
      expect(sql).toContain('OR i.INVOICE_ID = :invoiceId)');
      expect(binds.invoiceId).toEqual({ val: id, type: oracle.NUMBER });
    });

    it.each(['FAC-', 'ORD-000123', 'FAC 1', '1234567890123456'])(
      'does not treat %p as an invoice ID',
      async (search) => {
        mockList(0);
        await repository.listTransactions({ ...query, search });
        expect(call(0)[1].invoiceId).toBeUndefined();
      },
    );

    it('filters by branch, movie, status and purchase dates in Costa Rica time', async () => {
      mockList(0);
      await repository.listTransactions({
        ...query,
        branchId: 1,
        movieId: 62,
        status: 'CANCELLED',
        dateFrom: '2026-10-10',
        dateTo: '2026-10-16',
      });
      const [sql, binds] = call(0);
      expect(sql).toContain('t.BRANCH_ID = :branchId');
      expect(sql).toContain('f.MOVIE_ID = :movieId');
      expect(sql).toContain('i.STATUS = :status');
      expect(sql).toContain(
        "i.CREATED_AT >= FROM_TZ(TO_TIMESTAMP(:dateFrom, 'YYYY-MM-DD'), 'America/Costa_Rica')",
      );
      expect(sql).toContain(
        "i.CREATED_AT < FROM_TZ(TO_TIMESTAMP(:dateTo, 'YYYY-MM-DD'), 'America/Costa_Rica') + INTERVAL '1' DAY",
      );
      expect(binds).toEqual({
        branchId: { val: 1, type: oracle.NUMBER },
        movieId: { val: 62, type: oracle.NUMBER },
        status: { val: 'CANCELLED', type: oracle.STRING },
        dateFrom: { val: '2026-10-10', type: oracle.STRING },
        dateTo: { val: '2026-10-16', type: oracle.STRING },
      });
    });

    it('treats a missing count as zero', async () => {
      db.query.mockResolvedValueOnce({});
      const result = await repository.listTransactions(query);
      expect(result.total).toBe(0);
    });

    it('propagates database errors', async () => {
      const error = new Error('ORA-00942');
      db.query.mockRejectedValueOnce(error);
      await expect(repository.listTransactions(query)).rejects.toBe(error);
    });
  });

  describe('listFilterOptions', () => {
    it('lists the branches and movies that have transactions', async () => {
      db.query
        .mockResolvedValueOnce({
          rows: [
            { ID: 1, NAME: 'Cinetadel Multiplaza del Este' },
            { ID: 25, NAME: null },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ ID: 62, TITLE: 'Ecos del Volcán' }],
        });
      await expect(repository.listFilterOptions()).resolves.toEqual({
        branches: [
          { id: 1, name: 'Cinetadel Multiplaza del Este' },
          { id: 25, name: null },
        ],
        movies: [{ id: 62, title: 'Ecos del Volcán' }],
      });
      expect(call(0)[0]).toContain("i.STATUS IN ('PAID', 'CANCELLED')");
      expect(call(1)[0]).toContain('SELECT DISTINCT m.MOVIE_ID AS ID');
    });

    it('treats missing rows as no options', async () => {
      db.query.mockResolvedValue({});
      await expect(repository.listFilterOptions()).resolves.toEqual({
        branches: [],
        movies: [],
      });
    });
  });
});
