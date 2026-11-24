import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException, RequestMethod } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { ParseDecimalIdPipe } from '../common/pipes/parse-decimal-id.pipe';

describe('PurchasesController: eligible promotions', () => {
  let controller: PurchasesController;
  let service: { availablePromotions: jest.Mock };
  beforeEach(() => {
    service = { availablePromotions: jest.fn() };
    controller = new PurchasesController(service as unknown as PurchasesService);
  });
  it('converts the route ID to a number and returns eligible results unchanged', async () => {
    const promotions = [{ promotionId: 42, promotionType: 'percentage', promotionAmount: 25 }];
    service.availablePromotions.mockResolvedValueOnce(promotions);
    await expect(controller.promotions('4')).resolves.toBe(promotions);
    expect(service.availablePromotions).toHaveBeenCalledTimes(1);
    expect(service.availablePromotions).toHaveBeenCalledWith(4);
  });
  it('returns an empty list without treating it as an error', async () => {
    service.availablePromotions.mockResolvedValueOnce([]);
    await expect(controller.promotions('4')).resolves.toEqual([]);
  });
  it.each([
    new BadRequestException('Invalid ID'),
    new ConflictException('Unavailable function'),
    new NotFoundException('Movie function not found.'),
    new Error('Database unavailable'),
  ])('preserves service failure %p', async (error) => {
    service.availablePromotions.mockRejectedValueOnce(error);
    await expect(controller.promotions('4')).rejects.toBe(error);
  });
  it('registers a no-store GET route with the existing ID pipe', () => {
    expect(Reflect.getMetadata('path', controller.promotions)).toBe('functions/:id/promotions');
    expect(Reflect.getMetadata('method', controller.promotions)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('__headers__', controller.promotions)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
    const args = Reflect.getMetadata('__routeArguments__', PurchasesController, 'promotions') as Record<string, { data: string; pipes: unknown[] }>;
    expect(Object.values(args)).toContainEqual(expect.objectContaining({ data: 'id', pipes: [ParseDecimalIdPipe] }));
    expect(Reflect.getMetadata('__guards__', PurchasesController)).toHaveLength(3);
  });
});
