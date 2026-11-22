import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { PromotionalEmailPromotion } from './promotional-email-template';

export interface PromotionalEmailRecipient {
  clientId: number;
  email: string;
  name: string;
}

@Injectable()
export class PromotionalEmailRepository {
  constructor(private readonly db: DatabaseService) {}

  async findRecipients(): Promise<PromotionalEmailRecipient[]> {
    const result = await this.db.query<{
      CLIENT_ID: number;
      EMAIL: string;
      FIRST_NAME: string;
    }>(
      `SELECT CLIENT_ID, EMAIL, FIRST_NAME FROM CLIENTS
        WHERE PROMO_EMAIL_OPT_IN = 1 AND STATUS = 'ACTIVE'
        ORDER BY CLIENT_ID`,
    );
    return (result.rows ?? []).map((row) => ({
      clientId: row.CLIENT_ID,
      email: row.EMAIL,
      name: row.FIRST_NAME,
    }));
  }

  async findActivePromotions(): Promise<PromotionalEmailPromotion[]> {
    const result = await this.db.query<{
      PROMOTION_TITLE: string;
      PROMOTION_DESCRIPTION: string;
    }>(
      `SELECT PROMOTION_TITLE, PROMOTION_DESCRIPTION FROM promotions
        WHERE TRUNC(SYSDATE) BETWEEN begin_date AND end_date
        ORDER BY begin_date, promotion_id`,
    );
    return (result.rows ?? []).map((row) => ({
      title: row.PROMOTION_TITLE,
      description: row.PROMOTION_DESCRIPTION,
    }));
  }
}
