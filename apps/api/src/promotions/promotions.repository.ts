// promotions.repository.ts
import { Injectable } from '@nestjs/common';
import * as oracledb from 'oracledb';

import { DatabaseService } from '../database/database.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';

@Injectable()
export class PromotionsRepository {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  async create(dto: CreatePromotionDto): Promise<number> {
    return this.db.transaction(async (connection) => {
      const result = await connection.execute(
        `
          INSERT INTO promotions (
            promotion_type,
            promotion_amount,
            begin_date,
            end_date,
            begin_hour,
            end_hour,
            projection_format,
            technology,
            promotion_title,
            promotion_description,
            conditions,
            poster_path
          )
          VALUES (
            :promotionType,
            :promotionAmount,
            TO_DATE(:beginDate, 'FXYYYY-MM-DD'),
            TO_DATE(:endDate, 'FXYYYY-MM-DD'),
            NUMTODSINTERVAL(:beginSeconds, 'SECOND'),
            NUMTODSINTERVAL(:endSeconds, 'SECOND'),
            :projectionFormat,
            :technology,
            :promotionTitle,
            :description,
            :conditions,
            :posterPath
          )
          RETURNING promotion_id INTO :promotionId
        `,
        {
          promotionType: dto.promotionType,
          promotionAmount: dto.promotionAmount,
          beginDate: dto.beginDate,
          endDate: dto.endDate,

          beginSeconds: {
            val: this.toSeconds(dto.beginHour),
            type: oracledb.NUMBER,
          },
          endSeconds: {
            val: this.toSeconds(dto.endHour),
            type: oracledb.NUMBER,
          },

          projectionFormat: dto.projectionFormat ?? null,
          technology: dto.technology ?? null,
          promotionTitle: dto.promotionTitle.trim(),
          description: dto.description.trim(),
          conditions: dto.conditions ?? null,
          posterPath: dto.posterPath ?? null,

          promotionId: {
            dir: oracledb.BIND_OUT,
            type: oracledb.NUMBER,
          },
        },
        { autoCommit: false },
      );

      const outBinds = result.outBinds as {
        promotionId: number[];
      };

      const promotionId = outBinds.promotionId[0];

      if (dto.weekdays?.length) {
        await connection.executeMany(
          `
            INSERT INTO promotion_weekdays (
              promotion_id,
              day_of_week
            )
            VALUES (
              :promotionId,
              :dayOfWeek
            )
          `,
          dto.weekdays.map((dayOfWeek) => ({
            promotionId,
            dayOfWeek,
          })),
          {
            autoCommit: false,
            bindDefs: {
              promotionId: { type: oracledb.NUMBER },
              dayOfWeek: { type: oracledb.NUMBER },
            },
          },
        );
      }

      return promotionId;
    });
  }

  private toSeconds(value?: string | null): number | null {
    if (value == null) {
      return null;
    }

    const [hours, minutes] = value.split(':').map(Number);

    return hours * 3600 + minutes * 60;
  }
}
