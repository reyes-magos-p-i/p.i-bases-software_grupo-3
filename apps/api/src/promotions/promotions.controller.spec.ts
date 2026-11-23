import 'reflect-metadata';
import { BadRequestException, NotFoundException, RequestMethod } from '@nestjs/common';

import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

describe('PromotionsController', () => {
  let controller: PromotionsController;
  let service: {
    create: jest.Mock;
    update: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
  };

  const dto: CreatePromotionDto = {
    promotionType: 'percentage',
    promotionAmount: 25,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
    promotionTitle: 'Afternoon discount',
    description: 'Discount description.',
    branchIds: [1, 2]
  };

  const listItem = {
    promotionId: 42,
    promotionType: 'percentage' as const,
    technology: 'IMAX' as const,
    promotionTitle: 'Afternoon discount',
    projectionFormat: '2D' as const,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
  };
  const detail = {
    ...listItem,
    promotionAmount: 25,
    description: 'Discount description.',
    conditions: null,
    posterPath: '/uploads/promotions/banner.webp',
    beginHour: '14:30',
    endHour: '24:00',
    weekdays: [2, 4],
    branchIds: [1, 2],
  };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
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

  describe('findAll', () => {
    it('returns the basic catalog from the service', async () => {
      service.findAll.mockResolvedValue([listItem]);
      await expect(controller.findAll()).resolves.toEqual([listItem]);
      expect(service.findAll).toHaveBeenCalledWith();
      expect(service.findAll).toHaveBeenCalledTimes(1);
    });

    it('returns an empty list when no promotions exist', async () => {
      service.findAll.mockResolvedValue([]);
      await expect(controller.findAll()).resolves.toEqual([]);
    });

    it('propagates service errors', async () => {
      const error = new Error('Database unavailable');
      service.findAll.mockRejectedValueOnce(error);
      await expect(controller.findAll()).rejects.toBe(error);
    });
  });

  describe('findOne', () => {
    it('passes the numeric ID and returns full promotion details', async () => {
      service.findOne.mockResolvedValue(detail);
      await expect(controller.findOne(42)).resolves.toEqual(detail);
      expect(service.findOne).toHaveBeenCalledTimes(1);
      expect(service.findOne).toHaveBeenCalledWith(42);
    });

    it('propagates not-found errors', async () => {
      const error = new NotFoundException('Promotion not found.');
      service.findOne.mockRejectedValueOnce(error);
      await expect(controller.findOne(999)).rejects.toBe(error);
    });

    it('propagates other service failures', async () => {
      const error = new Error('Database unavailable');
      service.findOne.mockRejectedValueOnce(error);
      await expect(controller.findOne(42)).rejects.toBe(error);
    });
  });
  describe('update', () => {
    it('passes the ID and body and returns the service response', async () => {
      service.update.mockResolvedValueOnce({ promotionId: 42 });
      await expect(controller.update(42, dto)).resolves.toEqual({ promotionId: 42 });
      expect(service.update).toHaveBeenCalledWith(42, dto);
      expect(service.update).toHaveBeenCalledTimes(1);
    });
    it.each([new BadRequestException('Invalid promotion'), new NotFoundException('Promotion not found.'), new Error('Database unavailable')])(
      'preserves update failures: %p', async (error) => {
        service.update.mockRejectedValueOnce(error);
        await expect(controller.update(42, dto)).rejects.toBe(error);
      },
    );
    it('registers PUT :id behind the existing controller guards', () => {
      expect(Reflect.getMetadata('path', controller.update)).toBe(':id');
      expect(Reflect.getMetadata('method', controller.update)).toBe(RequestMethod.PUT);
      expect(Reflect.getMetadata('__guards__', PromotionsController)).toHaveLength(3);
    });
  });

});
