import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import type { TicketEmailStatus } from './purchase.types';

export interface TicketEmailJob {
  id: number;
  recipient: string;
  attemptId: string;
}

@Injectable()
export class TicketEmailRepository {
  constructor(private readonly db: DatabaseService) {}

  async enqueueInitial(
    connection: oracle.Connection,
    id: number,
    email: string,
  ) {
    await connection.execute(
      `INSERT INTO PURCHASE_TICKET_EMAILS (INVOICE_ID,RECIPIENT_EMAIL,ATTEMPT_ID) VALUES (:id,:email,:attemptId)`,
      { id, email, attemptId: randomUUID() },
      { autoCommit: false },
    );
  }

  async status(id: number): Promise<TicketEmailStatus> {
    const result = await this.db.query<TicketEmailStatus>(
      `SELECT STATUS AS "status",RECIPIENT_EMAIL AS "recipient",TO_CHAR(SENT_AT AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "sentAt",GREATEST(0,CEIL(60-(CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE)-CAST(SYS_EXTRACT_UTC(REQUESTED_AT) AS DATE))*86400)) AS "retryAfter" FROM PURCHASE_TICKET_EMAILS WHERE INVOICE_ID=:id`,
      { id },
    );
    return (
      result.rows?.[0] ?? {
        status: 'NOT_REQUESTED',
        recipient: null,
        sentAt: null,
        retryAfter: 0,
      }
    );
  }

  async request(id: number, email: string): Promise<TicketEmailStatus> {
    try {
      const result = await this.db.query(
        `MERGE INTO PURCHASE_TICKET_EMAILS e USING (SELECT :id AS INVOICE_ID FROM DUAL) s ON (e.INVOICE_ID=s.INVOICE_ID) WHEN MATCHED THEN UPDATE SET e.RECIPIENT_EMAIL=:email,e.STATUS='PENDING',e.ATTEMPT_ID=:attemptId,e.REQUESTED_AT=SYSTIMESTAMP,e.UPDATED_AT=SYSTIMESTAMP WHERE e.STATUS NOT IN ('PENDING','SENDING') AND e.REQUESTED_AT <= SYSTIMESTAMP-INTERVAL '60' SECOND WHEN NOT MATCHED THEN INSERT (INVOICE_ID,RECIPIENT_EMAIL,ATTEMPT_ID) VALUES (:id,:email,:attemptId)`,
        { id, email, attemptId: randomUUID() },
      );
      if (result.rowsAffected !== 1) throw this.busy();
    } catch (error) {
      if ((error as { errorNum?: number } | null)?.errorNum === 1)
        throw this.busy();
      throw error;
    }
    return this.status(id);
  }

  private busy() {
    return new ConflictException(
      'Ya hay un envío en curso o se solicitó hace poco. Espera un minuto antes de reenviar.',
    );
  }

  async pending(): Promise<TicketEmailJob[]> {
    // A process may stop after SMTP accepts a message. Never resend that attempt automatically.
    await this.db.query(
      `UPDATE PURCHASE_TICKET_EMAILS SET STATUS='UNKNOWN',UPDATED_AT=SYSTIMESTAMP WHERE STATUS='SENDING' AND UPDATED_AT < SYSTIMESTAMP-INTERVAL '10' MINUTE`,
    );
    const result = await this.db.query<TicketEmailJob>(
      `SELECT INVOICE_ID AS "id",RECIPIENT_EMAIL AS "recipient",ATTEMPT_ID AS "attemptId" FROM PURCHASE_TICKET_EMAILS WHERE STATUS='PENDING' ORDER BY REQUESTED_AT,INVOICE_ID FETCH FIRST 3 ROWS ONLY`,
    );
    return result.rows ?? [];
  }

  async claim(job: TicketEmailJob): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE PURCHASE_TICKET_EMAILS SET STATUS='SENDING',ATTEMPTS=ATTEMPTS+1,UPDATED_AT=SYSTIMESTAMP WHERE INVOICE_ID=:id AND ATTEMPT_ID=:attemptId AND STATUS='PENDING'`,
      { id: job.id, attemptId: job.attemptId },
    );
    return result.rowsAffected === 1;
  }

  async finish(job: TicketEmailJob, status: 'SENT' | 'FAILED' | 'UNKNOWN') {
    await this.db.query(
      `UPDATE PURCHASE_TICKET_EMAILS SET STATUS=:status,UPDATED_AT=SYSTIMESTAMP,SENT_AT=CASE WHEN :status='SENT' THEN SYSTIMESTAMP ELSE SENT_AT END WHERE INVOICE_ID=:id AND ATTEMPT_ID=:attemptId AND STATUS='SENDING'`,
      { id: job.id, attemptId: job.attemptId, status },
    );
  }
}
