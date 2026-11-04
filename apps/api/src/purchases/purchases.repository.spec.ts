import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { PurchaseCatalogRepository } from './purchase-catalog.repository';
import { PurchasesRepository } from './purchases.repository';
import { purchaseQuote, selectionHash } from './purchase-rules';
import type { PurchaseFunction, PurchaseSeat } from './purchase.types';
import { guestPurchaseCode } from './guest-purchase-access';
import { TicketEmailRepository } from './ticket-email.repository';
const context: PurchaseFunction = {
  id: 4,
  movieId: 2,
  title: 'Película',
  synopsis: 'Historia',
  posterImage: '',
  branchId: 1,
  branchName: 'Cine',
  theaterId: 3,
  rows: 2,
  columns: 2,
  startsAt: '2099-01-01T20:00:00-06:00',
  endsAt: '2099-01-01T22:00:00-06:00',
  status: 'ACTIVE',
  available: true,
  format: '2D',
  technology: 'STANDARD',
  isPremiere: false,
  price: 3000,
};
const seats: PurchaseSeat[] = [
  {
    positionId: 1,
    theaterId: 3,
    rowNumber: 1,
    columnNumber: 1,
    type: 'normal',
    state: 'free',
  },
];
const selection = {
  functionId: 4,
  seats: { GENERAL: [1], CHILD: [], SENIOR: [] },
};
const valid = {
  ...selection,
  requestKey: 'b801323b-9057-460b-b6ab-a36aa4e9b7d2',
  quoteVersion: purchaseQuote(context, seats, selection).version,
};
describe('Atomic purchase storage', () => {
  const execute = jest.fn(),
    executeMany = jest.fn(),
    commit = jest.fn(),
    rollback = jest.fn(),
    close = jest.fn();
  const connection = { execute, executeMany, commit, rollback, close };
  const db = new DatabaseService({} as ConfigService);
  Object.assign(db, {
    pool: { getConnection: jest.fn().mockResolvedValue(connection) },
  });
  const catalog = { getFunction: jest.fn(), getLimits: jest.fn() };
  const emails = { enqueueInitial: jest.fn() };
  const repo = new PurchasesRepository(
    db,
    catalog as unknown as PurchaseCatalogRepository,
    emails as unknown as TicketEmailRepository,
  );
  let overrides: Record<string, unknown>;
  function prepareLargeSelection(quantity: number) {
    const large = Array.from({ length: quantity }, (_, index) => ({
      ...seats[0]!,
      positionId: index + 1,
      rowNumber: Math.floor(index / 100) + 1,
      columnNumber: (index % 100) + 1,
    }));
    const largeContext = {
      ...context,
      rows: Math.ceil(quantity / 100),
      columns: 100,
    };
    catalog.getFunction.mockResolvedValue(largeContext);
    catalog.getLimits.mockResolvedValue({
      maxTickets: quantity,
      maxGuestPurchases: 3,
    });
    const data = {
      ...valid,
      seats: {
        GENERAL: large.map((seat) => seat.positionId),
        CHILD: [],
        SENIOR: [],
      },
    };
    data.quoteVersion = purchaseQuote(largeContext, large, data).version;
    return { large, data };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    Object.assign(db, {
      pool: { getConnection: jest.fn().mockResolvedValue(connection) },
    });
    overrides = {};
    catalog.getFunction.mockResolvedValue(context);
    catalog.getLimits.mockResolvedValue({
      maxTickets: 10,
      maxGuestPurchases: 3,
    });
    execute.mockImplementation((sql: string) => {
      const key = Object.keys(overrides).find((part) => sql.includes(part));
      if (key) {
        const value = overrides[key];
        if (value instanceof Error) return Promise.reject(value);
        return Promise.resolve(value);
      }
      if (sql.includes('SELECT STATUS,EMAIL'))
        return Promise.resolve({
          rows: [{ STATUS: 'ACTIVE', EMAIL: 'client@example.com' }],
        });
      if (sql.includes('REQUEST_HASH AS')) return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT MOVIE_FUNCTION_ID'))
        return Promise.resolve({ rows: [{ MOVIE_FUNCTION_ID: 4 }] });
      if (sql.includes('FROM SEATS s')) return Promise.resolve({ rows: seats });
      if (sql.includes('FROM PRODUCTS WHERE'))
        return Promise.resolve({
          rows: [{ id: 3, code: 'TICKET_GENERAL_STANDARD' }],
        });
      if (sql.includes('INSERT INTO INVOICES'))
        return Promise.resolve({ outBinds: { id: [12] } });
      if (sql.includes('AS "contextJson"'))
        return Promise.resolve({
          rows: [
            {
              id: 12,
              functionId: 4,
              purchasedAt: '2099-01-01T12:00:00-06:00',
              status: 'PAID',
              buyerEmail: 'client@example.com',
              total: 3000,
              contextJson: JSON.stringify({
                function: context,
                lines: purchaseQuote(context, seats, selection).lines,
              }),
            },
          ],
        });
      if (sql.includes('FROM TICKETS tk'))
        return Promise.resolve({
          rows: [
            {
              id: 1,
              functionId: 4,
              rowNumber: 1,
              columnNumber: 1,
              category: 'GENERAL',
            },
          ],
        });
      return Promise.resolve({ rows: [], rowsAffected: 1 });
    });
    executeMany.mockImplementation((_sql: string, rows: unknown[]) =>
      Promise.resolve({ rowsAffected: rows.length }),
    );
  });
  it('commits the invoice, lines and tickets together and preserves physical seats', async () => {
    const result = await repo.confirm(8, valid);
    expect(result).toMatchObject({
      id: 12,
      reference: 'ORD-000012',
      total: 3000,
      tickets: [{ rowNumber: 1, columnNumber: 1 }],
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(emails.enqueueInitial).toHaveBeenCalledWith(
      connection,
      12,
      'client@example.com',
    );
    expect(emails.enqueueInitial.mock.invocationCallOrder[0]).toBeLessThan(
      commit.mock.invocationCallOrder[0]!,
    );
    expect(rollback).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(executeMany).toHaveBeenCalledTimes(2);
    const invoiceCall = execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO INVOICES'),
    );
    expect(invoiceCall?.[0]).toContain("'PAID','SIMULATED'");
    expect(invoiceCall?.[1]).toMatchObject({
      clientId: 8,
      email: 'client@example.com',
      total: 3000,
      key: valid.requestKey,
    });
    expect(
      execute.mock.calls.some(([sql]) =>
        /UPDATE SEATS|DELETE FROM SEATS/u.test(String(sql)),
      ),
    ).toBe(false);
    expect(executeMany.mock.calls[1][1]).toEqual([
      {
        functionId: 4,
        theaterId: 3,
        rowNumber: 1,
        columnNumber: 1,
        invoiceId: 12,
        productId: 3,
      },
    ]);
  });
  it('prepares current client and guest tickets for delivery while preserving the canonical purchase QR', async () => {
    overrides['SELECT CLIENT_ID AS'] = {
      rows: [
        {
          clientId: 8,
          email: 'client@example.com',
          requestKey: valid.requestKey,
        },
      ],
    };
    const client = await repo.findForEmail(12);
    expect(client.accessCode).toBeUndefined();
    expect(JSON.parse(client.receipt.qrPayload)).toEqual({
      type: 'CINETADEL_PURCHASE',
      version: 1,
      reference: 'ORD-000012',
    });
    overrides['SELECT CLIENT_ID AS'] = {
      rows: [
        {
          clientId: null,
          email: 'guest@example.com',
          requestKey: valid.requestKey,
        },
      ],
    };
    const guest = await repo.findForEmail(12);
    expect(guest.accessCode).toBe(guestPurchaseCode(12, valid.requestKey));
    expect(guest.receipt.qrPayload).toBe(client.receipt.qrPayload);
    const ticketSql = execute.mock.calls.find(([sql]) =>
      String(sql).includes('FROM TICKETS tk'),
    )?.[0] as string;
    expect(ticketSql).toContain('c.BRANCH_ID=th.BRANCH_ID');
    expect(ticketSql).toContain('c.NAME AS "branchName"');
  });
  it('does not prepare email for a missing, cancelled or ticketless invoice', async () => {
    await expect(repo.findForEmail(12)).rejects.toMatchObject({ status: 404 });
    overrides['SELECT CLIENT_ID AS'] = { rows: [{ clientId: 8 }] };
    overrides['FROM TICKETS tk'] = { rows: [] };
    await expect(repo.findForEmail(12)).rejects.toThrow('no tiene boletos');
    expect(
      execute.mock.calls.find(([sql]) =>
        String(sql).includes('SELECT CLIENT_ID AS'),
      )?.[0],
    ).toContain("STATUS='PAID'");
  });
  it('does not enqueue another initial email when the payment key is replayed', async () => {
    overrides['REQUEST_HASH AS'] = {
      rows: [{ id: 12, hash: selectionHash(valid) }],
    };
    const receipt = await repo.confirm(8, valid);
    expect(receipt.id).toBe(12);
    expect(emails.enqueueInitial).not.toHaveBeenCalled();
  });
  it.each(['INSERT INTO INVOICES', 'FROM PRODUCTS WHERE'])(
    'rolls back when %s fails',
    async (fragment) => {
      overrides[fragment] = new Error('Database unavailable');
      await expect(repo.confirm(8, valid)).rejects.toThrow(
        'Database unavailable',
      );
      expect(rollback).toHaveBeenCalledTimes(1);
      expect(commit).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
  it.each([0, 1])('rolls back incomplete batch %i', async (batch) => {
    if (batch === 0) executeMany.mockResolvedValueOnce({ rowsAffected: 0 });
    else
      executeMany
        .mockResolvedValueOnce({ rowsAffected: 1 })
        .mockResolvedValueOnce({ rowsAffected: 0 });
    await expect(repo.confirm(8, valid)).rejects.toThrow('Incomplete purchase');
    expect(rollback).toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
  it('rejects inactive accounts and unavailable functions before inserting', async () => {
    overrides['SELECT STATUS,EMAIL'] = { rows: [{ STATUS: 'INACTIVE' }] };
    await expect(repo.confirm(8, valid)).rejects.toThrow('Tu sesión');
    delete overrides['SELECT STATUS,EMAIL'];
    catalog.getFunction.mockResolvedValue({ ...context, available: false });
    await expect(repo.confirm(8, valid)).rejects.toThrow('La función');
    expect(executeMany).not.toHaveBeenCalled();
  });
  it('rejects missing functions and invalid selections without partial purchases', async () => {
    overrides['SELECT MOVIE_FUNCTION_ID'] = { rows: [] };
    await expect(repo.confirm(8, valid)).rejects.toThrow(
      'La función no existe',
    );
    await expect(
      repo.confirm(8, {
        ...valid,
        seats: { GENERAL: [], CHILD: [], SENIOR: [] },
      }),
    ).rejects.toThrow('Selecciona');
    expect(executeMany).not.toHaveBeenCalled();
  });
  it('revalidates seat availability and quote changes under locks', async () => {
    overrides['FROM SEATS s'] = { rows: [{ ...seats[0], state: 'in-use' }] };
    await expect(repo.confirm(8, valid)).rejects.toThrow('Algunos asientos');
    delete overrides['FROM SEATS s'];
    await expect(
      repo.confirm(8, { ...valid, quoteVersion: 'b'.repeat(64) }),
    ).rejects.toThrow('Los datos o el precio');
    expect(executeMany).not.toHaveBeenCalled();
  });
  it('refuses a missing pricing product and a function starting during registration', async () => {
    overrides['FROM PRODUCTS WHERE'] = { rows: [] };
    await expect(repo.confirm(8, valid)).rejects.toThrow(
      'preparar los boletos',
    );
    delete overrides['FROM PRODUCTS WHERE'];
    catalog.getFunction
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce({ ...context, available: false });
    await expect(repo.confirm(8, valid)).rejects.toThrow('La función');
    expect(rollback).toHaveBeenCalledTimes(2);
    expect(commit).not.toHaveBeenCalled();
  });
  it('returns the same invoice on retry, even if the function has started', async () => {
    overrides['REQUEST_HASH AS'] = {
      rows: [{ id: 12, hash: selectionHash(valid) }],
    };
    catalog.getFunction.mockResolvedValue(null);
    expect(await repo.confirm(8, valid)).toMatchObject({ id: 12 });
    expect(executeMany).not.toHaveBeenCalled();
    expect(
      execute.mock.calls.find(([sql]) =>
        String(sql).includes('REQUEST_HASH AS'),
      )?.[1],
    ).toEqual({ key: valid.requestKey, clientId: 8 });
  });
  it('rejects a reused key with a different selection', async () => {
    overrides['REQUEST_HASH AS'] = { rows: [{ id: 12, hash: 'other' }] };
    await expect(repo.confirm(8, valid)).rejects.toThrow('otra selección');
    expect(executeMany).not.toHaveBeenCalled();
  });
  it.each([54, 30006, 60])(
    'reports Oracle lock conflict %i without committing',
    async (errorNum) => {
      overrides['SELECT MOVIE_FUNCTION_ID'] = Object.assign(new Error('lock'), {
        errorNum,
      });
      await expect(repo.confirm(8, valid)).rejects.toMatchObject({
        response: {
          code: 'PURCHASE_BUSY',
          message: expect.stringContaining('Otra operación'),
        },
      });
      expect(rollback).toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    },
  );
  it('handles unique-seat races and replays a committed request after a unique-key race', async () => {
    overrides['INSERT INTO INVOICES'] = Object.assign(new Error('unique'), {
      errorNum: 1,
    });
    await expect(repo.confirm(8, valid)).rejects.toThrow('ya fue comprado');
    let previousCalls = 0;
    const original = execute.getMockImplementation()!;
    execute.mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.includes('REQUEST_HASH AS')) {
        previousCalls++;
        return Promise.resolve({
          rows:
            previousCalls === 1 ? [] : [{ id: 12, hash: selectionHash(valid) }],
        });
      }
      return original(sql, ...args);
    });
    expect(await repo.confirm(8, valid)).toMatchObject({ id: 12 });
    expect(commit).not.toHaveBeenCalled();
  });
  it.each([
    ['client', () => repo.confirm(8, valid)],
    ['guest', () => repo.confirmGuest('guest@example.com', valid)],
  ])(
    'stops a %s buyer who would exceed the tickets of a function',
    async (_buyer, buy) => {
      overrides['COUNT(*) AS TOTAL FROM TICKETS'] = {
        rows: [{ TOTAL: 10 }],
      };
      await expect(buy()).rejects.toMatchObject({
        response: { code: 'TICKET_LIMIT_REACHED' },
      });
      expect(executeMany).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledTimes(1);
      const [, binds] = execute.mock.calls.find(([sql]) =>
        String(sql).includes('COUNT(*) AS TOTAL FROM TICKETS'),
      ) as [string, Record<string, unknown>];
      expect(binds.functionId).toBe(valid.functionId);
    },
  );
  it('reads the configured limits inside the purchase transaction', async () => {
    catalog.getLimits.mockResolvedValue({
      maxTickets: 2,
      maxGuestPurchases: 1,
    });
    overrides['COUNT(*) AS TOTAL FROM TICKETS'] = { rows: [{ TOTAL: 2 }] };
    await expect(repo.confirm(8, valid)).rejects.toMatchObject({
      response: { code: 'TICKET_LIMIT_REACHED' },
    });
    expect(catalog.getLimits).toHaveBeenCalledWith(connection);
    overrides['COUNT(*) AS TOTAL FROM TICKETS'] = { rows: [{ TOTAL: 0 }] };
    overrides['COUNT(*) AS TOTAL FROM INVOICES'] = { rows: [{ TOTAL: 1 }] };
    await expect(
      repo.confirmGuest('guest@example.com', valid),
    ).rejects.toMatchObject({ response: { code: 'GUEST_EMAIL_LIMIT' } });
  });
  it('sells nothing when the limits cannot be read', async () => {
    catalog.getLimits.mockRejectedValue(new Error('settings unavailable'));
    await expect(repo.confirm(8, valid)).rejects.toThrow(
      'settings unavailable',
    );
    expect(executeMany).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });
  it('counts only paid tickets of the buyer and the function', async () => {
    await repo.confirm(8, valid);
    const [sql, binds] = execute.mock.calls.find(([text]) =>
      String(text).includes('COUNT(*) AS TOTAL FROM TICKETS'),
    ) as [string, Record<string, unknown>];
    expect(sql).toContain("i.STATUS='PAID'");
    expect(sql).toContain('i.CLIENT_ID=:clientId');
    expect(binds).toEqual({ functionId: valid.functionId, clientId: 8 });
    expect(
      execute.mock.calls.some(([text]) =>
        String(text).includes('COUNT(*) AS TOTAL FROM INVOICES'),
      ),
    ).toBe(false);
  });
  it('stops a guest email after its purchases of the last hour', async () => {
    overrides['COUNT(*) AS TOTAL FROM INVOICES'] = { rows: [{ TOTAL: 3 }] };
    await expect(
      repo.confirmGuest('guest@example.com', valid),
    ).rejects.toMatchObject({ response: { code: 'GUEST_EMAIL_LIMIT' } });
    expect(executeMany).not.toHaveBeenCalled();
    const [sql, binds] = execute.mock.calls.find(([text]) =>
      String(text).includes('COUNT(*) AS TOTAL FROM INVOICES'),
    ) as [string, Record<string, unknown>];
    expect(sql).toContain("INTERVAL '1' HOUR");
    expect(binds).toEqual({ email: 'guest@example.com' });
  });
  it('recovers a registered purchase before checking the limits', async () => {
    overrides['REQUEST_HASH AS'] = {
      rows: [{ id: 12, hash: selectionHash(valid) }],
    };
    overrides['COUNT(*) AS TOTAL FROM TICKETS'] = { rows: [{ TOTAL: 10 }] };
    await expect(repo.confirm(8, valid)).resolves.toMatchObject({ id: 12 });
    expect(
      execute.mock.calls.some(([sql]) =>
        String(sql).includes('COUNT(*) AS TOTAL FROM TICKETS'),
      ),
    ).toBe(false);
  });
  it('uses parameterized batches for large selections', async () => {
    const { large, data } = prepareLargeSelection(1001);
    overrides['FROM SEATS s'] = { rows: large };
    await repo.confirm(8, data);
    expect(
      execute.mock.calls.filter(([sql]) =>
        String(sql).includes('FROM SEATS s'),
      ),
    ).toHaveLength(2);
    expect(executeMany.mock.calls[1][1]).toHaveLength(1001);
  });
  it('locks each seat batch only after the previous batch finishes', async () => {
    const { large, data } = prepareLargeSelection(1001);
    const original = execute.getMockImplementation()!;
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const reached = new Promise<void>((resolve) => (started = resolve));
    let batches = 0;
    execute.mockImplementation((sql: string, ...args: unknown[]) => {
      if (!sql.includes('FROM SEATS s')) return original(sql, ...args);
      batches++;
      if (batches === 1) {
        started();
        return pending.then(() => ({ rows: large.slice(0, 1000) }));
      }
      return Promise.resolve({ rows: large.slice(1000) });
    });

    const result = repo.confirm(8, data);
    await reached;
    expect(batches).toBe(1);
    expect(executeMany).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    release();
    await expect(result).resolves.toMatchObject({ id: 12 });
    const locks = execute.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM SEATS s'),
    );
    expect(locks).toHaveLength(2);
    expect(locks[0][1]).toMatchObject({ p0: 1, p999: 1000 });
    expect(locks[1][1]).toMatchObject({ p0: 1001 });
    expect(locks[1][1]).not.toHaveProperty('p1');
    expect(
      locks.every(([sql]) => sql.includes('FOR UPDATE OF s.ROW_NUMBER WAIT 5')),
    ).toBe(true);
    expect(executeMany.mock.calls[1][1]).toHaveLength(1001);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rollback).not.toHaveBeenCalled();
  });
  it.each([1, 2])(
    'rolls back and stops later seat batches when batch %i fails',
    async (failedBatch) => {
      const { large, data } = prepareLargeSelection(2001);
      const original = execute.getMockImplementation()!;
      const failure = new Error('Seat lock failed');
      let batches = 0;
      execute.mockImplementation((sql: string, ...args: unknown[]) => {
        if (!sql.includes('FROM SEATS s')) return original(sql, ...args);
        batches++;
        if (batches === failedBatch) return Promise.reject(failure);
        return Promise.resolve({
          rows: large.slice((batches - 1) * 1000, batches * 1000),
        });
      });

      await expect(repo.confirm(8, data)).rejects.toBe(failure);
      expect(batches).toBe(failedBatch);
      expect(executeMany).not.toHaveBeenCalled();
      expect(
        execute.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO INVOICES'),
        ),
      ).toBe(false);
      expect(rollback).toHaveBeenCalledTimes(1);
      expect(commit).not.toHaveBeenCalled();
      expect(close).toHaveBeenCalledTimes(1);
    },
  );
  it('reports a cancelled function unless its tickets were rescheduled', async () => {
    overrides['AS "contextJson"'] = {
      rows: [
        { id: 12, functionId: 4, contextJson: null, functionCancelled: 1 },
      ],
    };
    overrides['FROM INVOICE_PRODUCTS ip JOIN'] = {};
    overrides['FROM TICKETS tk JOIN MOVIE_FUNCTIONS mf'] = { rows: [] };
    const query = jest.spyOn(db, 'query');
    expect(await repo.findOne(12, 8)).toMatchObject({
      functionCancelled: true,
    });
    const headerSql = query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes('AS "contextJson"'));
    expect(headerSql).toContain("mf.STATUS='CANCELLED' AND NOT EXISTS");
    expect(headerSql).toContain("cur.STATUS<>'CANCELLED'");
    query.mockRestore();
    overrides['AS "contextJson"'] = {
      rows: [
        { id: 12, functionId: 4, contextJson: null, functionCancelled: 0 },
      ],
    };
    expect(await repo.findOne(12, 8)).toMatchObject({
      functionCancelled: false,
    });
  });
  it('marks cancelled functions in the purchase history', async () => {
    overrides['COUNT(*)'] = { rows: [{ TOTAL: 2 }] };
    overrides['JSON_VALUE'] = {
      rows: [
        { id: 12, functionCancelled: 1 },
        { id: 13, functionCancelled: 0 },
      ],
    };
    expect(await repo.list(8, { page: 1 })).toMatchObject({
      items: [{ functionCancelled: true }, { functionCancelled: false }],
    });
  });
  it('protects ownership and never fabricates tickets for historical invoices', async () => {
    overrides['AS "contextJson"'] = { rows: [] };
    await expect(repo.findOne(12, 99)).rejects.toThrow('no pertenece');
    overrides['AS "contextJson"'] = {
      rows: [{ id: 12, functionId: 4, contextJson: null }],
    };
    overrides['FROM INVOICE_PRODUCTS ip JOIN'] = {
      rows: [
        {
          code: 'TICKET_GENERAL_VIP',
          label: 'VIP',
          quantity: 2,
          unitPrice: 4000,
        },
      ],
    };
    overrides['FROM TICKETS tk'] = {};
    expect(await repo.findOne(12, 8)).toMatchObject({
      lines: [{ subtotal: 8000, vip: true }],
      tickets: [],
    });
    catalog.getFunction.mockResolvedValue(null);
    await expect(repo.findOne(12, 8)).rejects.toThrow('consultar la función');
  });
  it('supports missing historical lines and returns bounded history pages', async () => {
    overrides['AS "contextJson"'] = {
      rows: [{ id: 12, functionId: 4, contextJson: null }],
    };
    overrides['FROM INVOICE_PRODUCTS ip JOIN'] = {};
    expect(await repo.findOne(12, 8)).toMatchObject({ lines: [] });
    delete overrides['FROM INVOICE_PRODUCTS ip JOIN'];
    overrides['COUNT(*)'] = { rows: [{ TOTAL: 11 }] };
    overrides['JSON_VALUE'] = { rows: [{ id: 12, title: 'Película' }] };
    expect(await repo.list(8, { page: 999 })).toMatchObject({
      page: 2,
      total: 11,
      totalPages: 2,
      items: [{ reference: 'ORD-000012' }],
    });
    overrides['COUNT(*)'] = {};
    overrides['JSON_VALUE'] = {};
    expect(await repo.list(8, { page: 1 })).toEqual({
      page: 1,
      total: 0,
      totalPages: 0,
      items: [],
    });
  });
  it('filters the history by order number and inclusive purchase dates', async () => {
    const query = jest.spyOn(db, 'query');
    await repo.list(8, {
      page: 1,
      search: 'ORD-0%',
      dateFrom: '2026-10-05',
      dateTo: '2026-10-10',
    });
    const [countSql, countBinds] = query.mock.calls[0];
    const [listSql, listBinds] = query.mock.calls[1];
    for (const sql of [countSql, listSql]) {
      expect(sql).toContain('i.CLIENT_ID=:clientId');
      expect(sql).toContain(
        String.raw`LOWER('ORD-' || LPAD(i.INVOICE_ID,6,'0')) LIKE :search ESCAPE '\'`,
      );
      expect(sql).toContain('i.CREATED_AT >= FROM_TZ(');
      expect(sql).toContain("+ INTERVAL '1' DAY");
    }
    expect(countBinds).toEqual({
      clientId: 8,
      search: String.raw`%ord-0\%%`,
      dateFrom: '2026-10-05',
      dateTo: '2026-10-10',
    });
    expect(listBinds).toEqual({ ...(countBinds as object), offset: 0 });
    query.mockRestore();
  });
  it('returns the payment and the food lines of an invoice without snapshot', async () => {
    overrides['AS "contextJson"'] = {
      rows: [
        {
          id: 122,
          functionId: 4,
          contextJson: null,
          paymentMethod: 'CARD',
          cardBrand: 'visa',
          cardLast4: '4242',
        },
      ],
    };
    overrides['FROM INVOICE_PRODUCTS ip JOIN'] = {
      rows: [
        { code: 'PRODUCT_1', label: 'Combo', quantity: 1, unitPrice: 4500 },
      ],
    };
    const query = jest.spyOn(db, 'query');
    expect(await repo.findOne(122, 8)).toMatchObject({
      paymentMethod: 'CARD',
      cardBrand: 'visa',
      cardLast4: '4242',
      lines: [{ code: 'PRODUCT_1', label: 'Combo', subtotal: 4500 }],
    });
    const linesSql = query.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql.includes('FROM INVOICE_PRODUCTS ip JOIN'));
    expect(linesSql).not.toContain("PRODUCT_TYPE='TICKET'");
    query.mockRestore();
  });
  it('stores guest invoices without an account and restricts retries to the original email', async () => {
    const receipt = await repo.confirmGuest('guest@example.com', valid);
    expect(receipt.accessCode).toBe(guestPurchaseCode(12, valid.requestKey));
    expect(
      execute.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO INVOICES'),
      )?.[1],
    ).toMatchObject({ clientId: null, email: 'guest@example.com' });
    const lookup = execute.mock.calls.find(([sql]) =>
      sql.includes('REQUEST_HASH AS'),
    );
    expect(lookup?.[0]).toContain(
      'i.CLIENT_ID IS NULL AND i.BUYER_EMAIL=:email',
    );
    expect(lookup?.[1]).toEqual({
      key: valid.requestKey,
      email: 'guest@example.com',
    });
    expect(
      execute.mock.calls.some(
        ([sql]) =>
          sql.includes('FOR UPDATE WAIT 5') && sql.includes('FROM CLIENTS'),
      ),
    ).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  it('rejects a guest email that became registered before confirmation', async () => {
    overrides['AS "verificationPending"'] = {
      rows: [{ status: 'ACTIVE', verificationPending: 0 }],
    };
    await expect(
      repo.confirmGuest('client@example.com', valid),
    ).rejects.toMatchObject({ response: { code: 'CLIENT_LOGIN_REQUIRED' } });
    expect(executeMany).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['INACTIVE', 0, 'CLIENT_ACCOUNT_INACTIVE'],
    ['ACTIVE', 1, 'CLIENT_VERIFICATION_REQUIRED'],
  ])(
    'checks the %s account state with verification %i inside the confirmation transaction',
    async (status, verificationPending, code) => {
      overrides['AS "verificationPending"'] = {
        rows: [{ status, verificationPending }],
      };
      await expect(
        repo.confirmGuest('guest@example.com', valid),
      ).rejects.toMatchObject({ response: { code } });
      expect(executeMany).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledTimes(1);
      const check = execute.mock.calls.find(([sql]) =>
        sql.includes('AS "verificationPending"'),
      );
      expect(check?.[0]).toContain('CLIENT_EMAIL_VERIFICATIONS');
      expect(check?.[1]).toEqual({ email: 'guest@example.com' });
    },
  );
  it.each(['client', 'guest'])(
    'returns a definitive 404 for a %s only after checking the request key',
    async (buyer) => {
      overrides['SELECT MOVIE_FUNCTION_ID'] = { rows: [] };
      const pending =
        buyer === 'client'
          ? repo.confirm(8, valid)
          : repo.confirmGuest('guest@example.com', valid);
      await expect(pending).rejects.toMatchObject({ status: 404 });
      const queries = execute.mock.calls.map(([sql]) => sql as string);
      expect(
        queries.findIndex((sql) => sql.includes('REQUEST_HASH AS')),
      ).toBeLessThan(
        queries.findIndex((sql) => sql.startsWith('SELECT MOVIE_FUNCTION_ID')),
      );
      expect(executeMany).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledTimes(1);
    },
  );
  it('returns a committed guest retry even if the email was subsequently registered', async () => {
    overrides['REQUEST_HASH AS'] = {
      rows: [{ id: 12, hash: selectionHash(valid) }],
    };
    overrides['AS "verificationPending"'] = {
      rows: [{ status: 'ACTIVE', verificationPending: 0 }],
    };
    await expect(
      repo.confirmGuest('guest@example.com', valid),
    ).resolves.toMatchObject({
      id: 12,
      accessCode: guestPurchaseCode(12, valid.requestKey),
    });
    expect(executeMany).not.toHaveBeenCalled();
    expect(
      execute.mock.calls.some(([sql]) =>
        sql.includes('AS "verificationPending"'),
      ),
    ).toBe(false);
  });
  it.each([0, 1])(
    'rolls back a guest purchase when batch %i is incomplete',
    async (batch) => {
      if (batch === 0) executeMany.mockResolvedValueOnce({ rowsAffected: 0 });
      else
        executeMany
          .mockResolvedValueOnce({ rowsAffected: 1 })
          .mockResolvedValueOnce({ rowsAffected: 0 });
      await expect(
        repo.confirmGuest('guest@example.com', valid),
      ).rejects.toThrow('Incomplete purchase');
      expect(commit).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledTimes(1);
    },
  );
  it('recovers a guest unique-key race without changing the code', async () => {
    overrides['INSERT INTO INVOICES'] = Object.assign(new Error('unique'), {
      errorNum: 1,
    });
    const original = execute.getMockImplementation()!;
    let calls = 0;
    execute.mockImplementation((sql: string, ...args: unknown[]) => {
      if (sql.includes('REQUEST_HASH AS'))
        return Promise.resolve({
          rows: ++calls === 3 ? [{ id: 12, hash: selectionHash(valid) }] : [],
        });
      return original(sql, ...args);
    });
    await expect(
      repo.confirmGuest('guest@example.com', valid),
    ).resolves.toMatchObject({
      accessCode: guestPurchaseCode(12, valid.requestKey),
    });
    expect(rollback).toHaveBeenCalledTimes(1);
  });
  it('checks the consultation secret before reading tickets and excludes client invoices', async () => {
    const code = guestPurchaseCode(12, valid.requestKey);
    await expect(repo.findGuest('ORD-000012')).rejects.toThrow(
      'código de consulta',
    );
    expect(execute).not.toHaveBeenCalled();
    overrides['REQUEST_KEY AS'] = { rows: [] };
    await expect(repo.findGuest(code)).rejects.toThrow('código de consulta');
    overrides['REQUEST_KEY AS'] = {
      rows: [{ requestKey: valid.requestKey, email: 'guest@example.com' }],
    };
    await expect(
      repo.findGuest(guestPurchaseCode(12, 'other')),
    ).rejects.toThrow('código de consulta');
    expect(
      execute.mock.calls.some(([sql]) => sql.includes('FROM TICKETS')),
    ).toBe(false);
    await expect(repo.findGuest(code)).resolves.toMatchObject({
      id: 12,
      accessCode: code,
      tickets: [{ id: 1 }],
    });
    const access = execute.mock.calls.find(([sql]) =>
      sql.includes('REQUEST_KEY AS'),
    );
    expect(access?.[0]).toContain('CLIENT_ID IS NULL');
    expect(access?.[1]).toEqual({ id: 12 });
    const receipt = execute.mock.calls.find(([sql]) =>
      sql.includes('AS "contextJson"'),
    );
    expect(receipt?.[1]).toEqual({ id: 12, email: 'guest@example.com' });
    expect(receipt?.[0]).toContain(
      'i.CLIENT_ID IS NULL AND i.BUYER_EMAIL=:email',
    );
  });
  it('keeps a previously issued long code valid and returns its compact equivalent', async () => {
    const legacy =
      'INV-12-8adc0e5af26517c87370976d3876faeeef71cdc5d87c4a6987bcba1a5a54ff12';
    overrides['REQUEST_KEY AS'] = {
      rows: [{ requestKey: valid.requestKey, email: 'guest@example.com' }],
    };
    await expect(repo.findGuest(legacy)).resolves.toMatchObject({
      id: 12,
      accessCode: '12.4AVG75NWK52Z476W4QDMW7DYQE',
    });
  });
  it.each(['client', 'guest'])(
    'serializes a client and a %s competing for the same seat and commits exactly once',
    async (buyer) => {
      let lock = Promise.resolve(),
        sold = false,
        committed = 0;
      const sessions: {
        commit: jest.Mock;
        rollback: jest.Mock;
        executeMany: jest.Mock;
      }[] = [];
      const originalExecute = execute.getMockImplementation()!;
      const concurrentDb = new DatabaseService({} as ConfigService);
      Object.assign(concurrentDb, {
        pool: {
          getConnection: jest.fn().mockImplementation(() => {
            let release: (() => void) | undefined;
            const session = {
              execute: jest.fn(async (sql: string, ...args: unknown[]) => {
                if (sql.startsWith('SELECT MOVIE_FUNCTION_ID')) {
                  const previous = lock;
                  lock = new Promise<void>((done) => (release = done));
                  await previous;
                  return { rows: [{ MOVIE_FUNCTION_ID: 4 }] };
                }
                if (sql.includes('FROM SEATS s'))
                  return {
                    rows: [{ ...seats[0], state: sold ? 'in-use' : 'free' }],
                  };
                return originalExecute(sql, ...args);
              }),
              executeMany: jest.fn((_sql: string, rows: unknown[]) =>
                Promise.resolve({ rowsAffected: rows.length }),
              ),
              commit: jest.fn(() => {
                sold = true;
                committed++;
                release?.();
                return Promise.resolve();
              }),
              rollback: jest.fn(() => {
                release?.();
                return Promise.resolve();
              }),
              close: jest.fn(),
            };
            sessions.push(session);
            return Promise.resolve(session);
          }),
        },
      });
      const concurrent = new PurchasesRepository(
        concurrentDb,
        catalog as unknown as PurchaseCatalogRepository,
        emails as unknown as TicketEmailRepository,
      );
      const results = await Promise.allSettled([
        concurrent.confirm(8, valid),
        (buyer === 'client'
          ? concurrent.confirm.bind(concurrent, 9)
          : concurrent.confirmGuest.bind(concurrent, 'guest@example.com'))({
          ...valid,
          requestKey: 'ed36cbe4-3e88-4968-9950-66fbb8d567ff',
        }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      expect(committed).toBe(1);
      expect(
        sessions.reduce(
          (total, session) => total + session.executeMany.mock.calls.length,
          0,
        ),
      ).toBe(2);
      expect(
        sessions.reduce(
          (total, session) => total + session.rollback.mock.calls.length,
          0,
        ),
      ).toBe(1);
    },
  );
  it('replays two concurrent guest requests after the function lock without selling twice', async () => {
    let lock = Promise.resolve(),
      committed = false;
    const original = execute.getMockImplementation()!;
    const sessions: { executeMany: jest.Mock; commit: jest.Mock }[] = [];
    Object.assign(db, {
      pool: {
        getConnection: jest.fn(() => {
          let release: (() => void) | undefined;
          const session = {
            execute: jest.fn(async (sql: string, ...args: unknown[]) => {
              if (sql.includes('REQUEST_HASH AS'))
                return {
                  rows: committed
                    ? [{ id: 12, hash: selectionHash(valid) }]
                    : [],
                };
              if (sql.startsWith('SELECT MOVIE_FUNCTION_ID')) {
                const previous = lock;
                lock = new Promise<void>((resolve) => {
                  release = resolve;
                });
                await previous;
                return { rows: [{ MOVIE_FUNCTION_ID: 4 }] };
              }
              if (sql.includes('FROM SEATS s'))
                return {
                  rows: [{ ...seats[0], state: committed ? 'in-use' : 'free' }],
                };
              return original(sql, ...args);
            }),
            executeMany: jest.fn((_sql: string, rows: unknown[]) =>
              Promise.resolve({ rowsAffected: rows.length }),
            ),
            commit: jest.fn(() => {
              committed = true;
              release?.();
              return Promise.resolve();
            }),
            rollback: jest.fn(() => {
              release?.();
              return Promise.resolve();
            }),
            close: jest.fn(),
          };
          sessions.push(session);
          return Promise.resolve(session);
        }),
      },
    });
    const receipts = await Promise.all([
      repo.confirmGuest('guest@example.com', valid),
      repo.confirmGuest('guest@example.com', valid),
    ]);
    expect(receipts.map((receipt) => receipt.accessCode)).toEqual([
      guestPurchaseCode(12, valid.requestKey),
      guestPurchaseCode(12, valid.requestKey),
    ]);
    expect(
      sessions.reduce(
        (total, session) => total + session.executeMany.mock.calls.length,
        0,
      ),
    ).toBe(2);
    expect(
      sessions.every((session) => session.commit.mock.calls.length === 1),
    ).toBe(true);
  });
});
