// promotions.service.ts
import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsRepository } from './promotions.repository';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly repository: PromotionsRepository,
  ) {}

  async create(dto: CreatePromotionDto) {
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

    const promotionId = await this.repository.create(dto);

    return { promotionId };
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
