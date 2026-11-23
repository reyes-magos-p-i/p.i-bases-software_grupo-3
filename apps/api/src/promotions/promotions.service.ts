// promotions.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsRepository } from './promotions.repository';
import type { PromotionDetail, PromotionListItem } from './promotion-response.types';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly repository: PromotionsRepository,
  ) {}

  async findAll(): Promise<PromotionListItem[]> {
    return this.repository.findAll();
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
