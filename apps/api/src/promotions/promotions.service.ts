import type { Connection } from 'oracledb';
// promotions.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsRepository } from './promotions.repository';
import type { ApplicablePromotion, PromotionDetail, PromotionListItem } from './promotion-response.types';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly repository: PromotionsRepository,
  ) {}

  /** Lock selected promotion during confirmation, then recheck all restrictions. */
  async resolveForPurchase(functionId: number, promotionId?: number | null, connection?: Connection): Promise<ApplicablePromotion | undefined> {
    if (promotionId == null) return undefined;
    if (!Number.isSafeInteger(promotionId) || promotionId < 1)
      throw new BadRequestException('Selecciona una promoción válida.');
    if (connection) {
      await connection.execute(
        'SELECT promotion_id FROM promotions WHERE promotion_id = :id FOR UPDATE WAIT 5',
        { id: promotionId }, { autoCommit: false },
      );
    }
    const matches = await this.repository.findApplicableToMovieFunction(functionId, connection);
    const promotion = matches?.find((item) => item.promotionId === promotionId);
    if (!promotion) throw new ConflictException({
      code: 'PROMOTION_UNAVAILABLE',
      message: 'La promoción ya no está disponible para esta función. Actualiza el resumen.',
    });
    return promotion;
  }

  async findAll(): Promise<PromotionListItem[]> {
    return this.repository.findAll();
  }

  /** Match the function's start date/time and cinema, not the current date/time. */
  async findApplicableToMovieFunction(movieFunctionId: number): Promise<ApplicablePromotion[]> {
    if (!Number.isSafeInteger(movieFunctionId) || movieFunctionId < 1) {
      throw new BadRequestException('Movie function ID must be a positive safe integer.');
    }
    const promotions = await this.repository.findApplicableToMovieFunction(movieFunctionId);
    if (promotions === null) {
      throw new NotFoundException('Movie function not found.');
    }
    return promotions;
  }

  async findOne(id: number): Promise<PromotionDetail> {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('Promotion ID must be a positive safe integer.');
    }

    const promotion = await this.repository.findOne(id);
    if (!promotion) {
      throw new NotFoundException('Promotion not found.');
    }

    return promotion;
  }

  async create(dto: CreatePromotionDto) {
    this.validatePromotion(dto);

    const promotionId = await this.repository.create(dto);

    return { promotionId };
  }

  async update(id: number, dto: UpdatePromotionDto): Promise<{ promotionId: number }> {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException('Promotion ID must be a positive safe integer.');
    }
    this.validatePromotion(dto);
    const updated = await this.repository.update(id, dto);
    if (!updated) throw new NotFoundException('Promotion not found.');
    return { promotionId: id };
  }

  private validatePromotion(dto: CreatePromotionDto): void {
    if (
      dto.promotionType === 'percentage'
      && dto.promotionAmount > 100
    ) {
      throw new BadRequestException(
        'Percentage promotions cannot exceed 100.',
      );
    }

    if (
      !this.isValidDate(dto.beginDate)
      || !this.isValidDate(dto.endDate)
    ) {
      throw new BadRequestException(
        'beginDate and endDate must be valid calendar dates.',
      );
    }

    // YYYY-MM-DD strings can be compared in chronological order.
    if (dto.endDate < dto.beginDate) {
      throw new BadRequestException(
        'endDate must be on or after beginDate.',
      );
    }

    const hasBeginHour = dto.beginHour != null;
    const hasEndHour = dto.endHour != null;

    if (hasBeginHour !== hasEndHour) {
      throw new BadRequestException(
        'Provide both beginHour and endHour, or leave both empty.',
      );
    }

    if (
      hasBeginHour
      && hasEndHour
      && dto.beginHour! >= dto.endHour!
    ) {
      throw new BadRequestException(
        'endHour must be later than beginHour.',
      );
    }

    if (
      dto.technology === '70MM'
      && dto.projectionFormat === '3D'
    ) {
      throw new BadRequestException(
        '70MM cannot be combined with 3D.',
      );
    }

  }

  async remove(id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new BadRequestException(
        'Promotion ID must be a positive safe integer.',
      );
    }

    const removed = await this.repository.remove(id);

    if (!removed) {
      throw new NotFoundException('Promotion not found.');
    }
  }

  private isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    if (value.startsWith('0000-')) {
      return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
      !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value
    );
  }
}
