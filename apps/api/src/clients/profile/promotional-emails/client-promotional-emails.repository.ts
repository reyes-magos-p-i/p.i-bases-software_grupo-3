import { Injectable, UnauthorizedException } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../../../database/database.service';

const SESSION_ENDED = 'Tu sesión terminó. Inicia sesión nuevamente.';

@Injectable()
export class ClientPromotionalEmailsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getOptIn(id: number): Promise<boolean> {
    const result = await this.db.query<{ PROMO_EMAIL_OPT_IN: number }>(
      `SELECT PROMO_EMAIL_OPT_IN FROM CLIENTS WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'`,
      { id: { val: id, type: oracle.NUMBER } },
    );
    const row = result.rows?.[0];
    if (!row) throw new UnauthorizedException(SESSION_ENDED);
    return row.PROMO_EMAIL_OPT_IN === 1;
  }

  async setOptIn(id: number, enabled: boolean): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE CLIENTS SET PROMO_EMAIL_OPT_IN = :enabled WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'`,
      {
        id: { val: id, type: oracle.NUMBER },
        enabled: { val: enabled ? 1 : 0, type: oracle.NUMBER },
      },
    );
    if (result.rowsAffected !== 1)
      throw new UnauthorizedException(SESSION_ENDED);
    return enabled;
  }
}
