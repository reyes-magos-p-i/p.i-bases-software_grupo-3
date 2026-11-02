import { TicketEmailRepository } from './ticket-email.repository';
import type { DatabaseService } from '../database/database.service';
import type oracle from 'oracledb';

describe('Durable ticket email requests', () => {
  const query = jest.fn(),
    execute = jest.fn();
  const repo = new TicketEmailRepository({
    query,
  } as unknown as DatabaseService);
  const job = { id: 12, recipient: 'client@example.com', attemptId: 'attempt' };
  beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rowsAffected: 1, rows: [] });
  });
  it('enqueues the initial message using the purchase connection without committing it', async () => {
    await repo.enqueueInitial(
      { execute } as unknown as oracle.Connection,
      12,
      job.recipient,
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO PURCHASE_TICKET_EMAILS'),
      { id: 12, email: job.recipient, attemptId: expect.any(String) },
      { autoCommit: false },
    );
    expect(query).not.toHaveBeenCalled();
  });
  it('returns historical absence or a persisted status without inventing success', async () => {
    expect(await repo.status(12)).toEqual({
      status: 'NOT_REQUESTED',
      recipient: null,
      sentAt: null,
      retryAfter: 0,
    });
    query.mockResolvedValueOnce({
      rows: [
        {
          status: 'UNKNOWN',
          recipient: job.recipient,
          sentAt: null,
          retryAfter: 0,
        },
      ],
    });
    expect(await repo.status(12)).toMatchObject({ status: 'UNKNOWN' });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SYS_EXTRACT_UTC'),
      { id: 12 },
    );
  });
  it('queues an explicit resend with a new attempt identifier and a database cooldown', async () => {
    query
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rows: [{ status: 'PENDING' }] });
    expect(await repo.request(12, job.recipient)).toEqual({
      status: 'PENDING',
    });
    expect(query.mock.calls[0][0]).toContain("NOT IN ('PENDING','SENDING')");
    expect(query.mock.calls[0][0]).toContain("INTERVAL '60' SECOND");
    expect(query.mock.calls[0][1]).toMatchObject({
      id: 12,
      email: job.recipient,
    });
  });
  it.each([0, undefined])(
    'rejects concurrent requests when %s rows were updated',
    async (rowsAffected) => {
      query.mockResolvedValueOnce({ rowsAffected });
      await expect(repo.request(12, job.recipient)).rejects.toThrow(
        'Espera un minuto',
      );
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
  it('turns a concurrent insert race into the same conflict and preserves other database failures', async () => {
    query.mockRejectedValueOnce({ errorNum: 1 });
    await expect(repo.request(12, job.recipient)).rejects.toMatchObject({
      status: 409,
    });
    query.mockRejectedValueOnce(new Error('database offline'));
    await expect(repo.request(12, job.recipient)).rejects.toThrow(
      'database offline',
    );
  });
  it('marks interrupted sends uncertain and selects only pending requests in bounded batches', async () => {
    query
      .mockResolvedValueOnce({ rowsAffected: 1 })
      .mockResolvedValueOnce({ rows: [job] });
    expect(await repo.pending()).toEqual([job]);
    expect(query.mock.calls[0][0]).toContain("STATUS='UNKNOWN'");
    expect(query.mock.calls[1][0]).toContain("STATUS='PENDING'");
    expect(query.mock.calls[1][0]).toContain('FETCH FIRST 3');
    expect(await repo.pending()).toEqual([]);
  });
  it('claims a pending attempt exactly once and fences late completions by its identifier', async () => {
    expect(await repo.claim(job)).toBe(true);
    query.mockResolvedValueOnce({ rowsAffected: 0 });
    expect(await repo.claim(job)).toBe(false);
    await repo.finish(job, 'SENT');
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("AND STATUS='SENDING'"),
      { id: 12, attemptId: 'attempt', status: 'SENT' },
    );
  });
});
