// promotions.repository.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import * as oracledb from 'oracledb';

import { DatabaseService } from '../database/database.service';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import type { PromotionDetail, PromotionListItem } from './promotion-response.types';

@Injectable()
export class PromotionsRepository {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  /** Administrative catalog: includes future, current, and expired promotions. */
  async findAll(): Promise<PromotionListItem[]> {
    return this.db.transaction(async (connection) => {
      const result = await connection.execute<PromotionListItem>(
        `
          SELECT p.promotion_id AS "promotionId",
                 p.promotion_type AS "promotionType",
                 p.technology AS "technology",
                 p.promotion_title AS "promotionTitle",
                 p.projection_format AS "projectionFormat",
                 TO_CHAR(p.begin_date, 'YYYY-MM-DD') AS "beginDate",
                 TO_CHAR(p.end_date, 'YYYY-MM-DD') AS "endDate"
          FROM promotions p
          ORDER BY p.promotion_id DESC
        `,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return result.rows ?? [];
    });
  }

  async findOne(id: number): Promise<PromotionDetail | null> {
    return this.db.transaction(async (connection) => {
      const result = await connection.execute<Omit<PromotionDetail, 'weekdays' | 'branchIds'>>(
        `
          SELECT p.promotion_id AS "promotionId",
                 p.promotion_type AS "promotionType",
                 p.promotion_amount AS "promotionAmount",
                 p.promotion_title AS "promotionTitle",
                 p.promotion_description AS "description",
                 p.conditions AS "conditions",
                 p.poster_path AS "posterPath",
                 p.projection_format AS "projectionFormat",
                 p.technology AS "technology",
                 TO_CHAR(p.begin_date, 'YYYY-MM-DD') AS "beginDate",
                 TO_CHAR(p.end_date, 'YYYY-MM-DD') AS "endDate",
                 CASE WHEN p.begin_hour IS NULL THEN NULL ELSE
                   TO_CHAR(EXTRACT(DAY FROM p.begin_hour) * 24
                           + EXTRACT(HOUR FROM p.begin_hour), 'FM00')
                   || ':' || TO_CHAR(EXTRACT(MINUTE FROM p.begin_hour), 'FM00')
                 END AS "beginHour",
                 CASE WHEN p.end_hour IS NULL THEN NULL ELSE
                   TO_CHAR(EXTRACT(DAY FROM p.end_hour) * 24
                           + EXTRACT(HOUR FROM p.end_hour), 'FM00')
                   || ':' || TO_CHAR(EXTRACT(MINUTE FROM p.end_hour), 'FM00')
                 END AS "endHour"
          FROM promotions p
          WHERE p.promotion_id = :id
        `,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const promotion = result.rows?.[0];
      if (!promotion) return null;

      // Separate queries avoid multiplying cinema rows by weekday rows.
      // Use the same connection sequentially for all three reads.
      const weekdays = await connection.execute<{ dayOfWeek: number }>(
        `
          SELECT day_of_week AS "dayOfWeek"
          FROM promotion_weekdays
          WHERE promotion_id = :id
          ORDER BY day_of_week
        `,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const cinemas = await connection.execute<{ branchId: number }>(
        `
          SELECT branch_id AS "branchId"
          FROM promotion_cinemas
          WHERE promotion_id = :id
          ORDER BY branch_id
        `,
        { id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      return {
        ...promotion,
        weekdays: (weekdays.rows ?? []).map((row) => row.dayOfWeek),
        branchIds: (cinemas.rows ?? []).map((row) => row.branchId),
      };
    });
  }

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

      try {
        await connection.executeMany(
          `
            INSERT INTO promotion_cinemas (
              promotion_id,
              branch_id
            )
            VALUES (
              :promotionId,
              :branchId
            )
          `,
          dto.branchIds.map((branchId) => ({
            promotionId,
            branchId,
          })),
          {
            autoCommit: false,
            bindDefs: {
              promotionId: { type: oracledb.NUMBER },
              branchId: { type: oracledb.NUMBER },
            },
          },
        );
      } catch (error: unknown) {
        const oracleError = error as {
          errorNum?: number;
          message?: string;
        };

        if (
          oracleError?.errorNum === 2291
          && oracleError.message
            ?.toUpperCase()
            .includes('FK_PROMO_CINEMAS_CINEMA')
        ) {
          throw new BadRequestException(
            'One or more selected cinemas do not exist.',
          );
        }

        throw error;
      }
      return promotionId;


    });
  }

  /** The parent UPDATE locks the promotion until this transaction commits/rolls back. */
  async update(id: number, dto: UpdatePromotionDto): Promise<boolean> {
    return this.db.transaction(async (connection) => {
        await connection.execute(
        'ALTER SESSION DISABLE PARALLEL DML',
      );

      const result = await connection.execute(
        `UPDATE promotions SET
           promotion_type = :promotionType,
           promotion_amount = :promotionAmount,
           begin_date = TO_DATE(:beginDate, 'FXYYYY-MM-DD'),
           end_date = TO_DATE(:endDate, 'FXYYYY-MM-DD'),
           begin_hour = NUMTODSINTERVAL(:beginSeconds, 'SECOND'),
           end_hour = NUMTODSINTERVAL(:endSeconds, 'SECOND'),
           projection_format = :projectionFormat,
           technology = :technology,
           promotion_title = :promotionTitle,
           promotion_description = :description,
           conditions = :conditions,
           poster_path = :posterPath
         WHERE promotion_id = :id`,
        {
          id,
          promotionType: dto.promotionType,
          promotionAmount: dto.promotionAmount,
          beginDate: dto.beginDate,
          endDate: dto.endDate,
          beginSeconds: { val: this.toSeconds(dto.beginHour), type: oracledb.NUMBER },
          endSeconds: { val: this.toSeconds(dto.endHour), type: oracledb.NUMBER },
          projectionFormat: dto.projectionFormat ?? null,
          technology: dto.technology ?? null,
          promotionTitle: dto.promotionTitle.trim(),
          description: dto.description.trim(),
          conditions: dto.conditions ?? null,
          posterPath: dto.posterPath ?? null,
        },
        { autoCommit: false },
      );
      if (result.rowsAffected === 0) return false;

      await connection.execute(
        'DELETE FROM promotion_weekdays WHERE promotion_id = :id',
        { id }, { autoCommit: false },
      );
      await connection.execute(
        'DELETE FROM promotion_cinemas WHERE promotion_id = :id',
        { id }, { autoCommit: false },
      );
      if (dto.weekdays?.length) {
        await connection.executeMany(
          'INSERT INTO promotion_weekdays (promotion_id, day_of_week) VALUES (:promotionId, :dayOfWeek)',
          dto.weekdays.map((dayOfWeek) => ({ promotionId: id, dayOfWeek })),
          {
            autoCommit: false,
            bindDefs: {
              promotionId: { type: oracledb.NUMBER },
              dayOfWeek: { type: oracledb.NUMBER },
            },
          },
        );
      }
      try {
        await connection.executeMany(
          'INSERT INTO promotion_cinemas (promotion_id, branch_id) VALUES (:promotionId, :branchId)',
          dto.branchIds.map((branchId) => ({ promotionId: id, branchId })),
          {
            autoCommit: false,
            bindDefs: {
              promotionId: { type: oracledb.NUMBER },
              branchId: { type: oracledb.NUMBER },
            },
          },
        );
      } catch (error: unknown) {
        const oracleError = error as { errorNum?: number; message?: string };
        if (oracleError?.errorNum === 2291
          && oracleError.message?.toUpperCase().includes('FK_PROMO_CINEMAS_CINEMA')) {
          throw new BadRequestException('One or more selected cinemas do not exist.');
        }
        throw error;
      }
      return true;
    });
  }

  async remove(id: number): Promise<boolean> {
    return this.db.transaction(async (connection) => {
      // Lock the promotion before changing its associations.
      await connection.execute(
        'ALTER SESSION DISABLE PARALLEL DML',
      );

      const existing = await connection.execute(
        `SELECT promotion_id
        FROM promotions
        WHERE promotion_id = :id
        FOR UPDATE`,
        { id },
      );

      if (!existing.rows?.length) return false;

      await connection.execute(
        'DELETE FROM promotion_weekdays WHERE promotion_id = :id',
        { id },
        { autoCommit: false },
      );

      await connection.execute(
        'DELETE FROM promotion_cinemas WHERE promotion_id = :id',
        { id },
        { autoCommit: false },
      );

      await connection.execute(
        'DELETE FROM promotions WHERE promotion_id = :id',
        { id },
        { autoCommit: false },
      );

      return true;
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
