import { BadRequestException } from '@nestjs/common';

import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

describe('PromotionsController', () => {
  let controller: PromotionsController;
  let service: {
    create: jest.Mock;
  };

  const dto: CreatePromotionDto = {
    promotionType: 'percentage',
    promotionAmount: 25,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
    promotionTitle: 'Afternoon discount',
    description: 'Discount description.',
  };

  beforeEach(() => {
    service = {
      create: jest.fn(),
    };

    controller = new PromotionsController(
      service as unknown as PromotionsService,
    );
  });

  it('passes the DTO to the service and returns the result', async () => {
    service.create.mockResolvedValue({ promotionId: 42 });

    await expect(controller.create(dto)).resolves.toEqual({
      promotionId: 42,
    });

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('propagates service errors', async () => {
    const error = new BadRequestException('Invalid promotion');
    service.create.mockRejectedValue(error);

    await expect(controller.create(dto)).rejects.toBe(error);
  });
});
