import { BadRequestException } from '@nestjs/common';

import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsRepository } from './promotions.repository';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let repository: {
    create: jest.Mock;
  };

  const validDto = (): CreatePromotionDto => ({
    promotionType: 'percentage',
    promotionAmount: 25,
    beginDate: '2026-11-17',
    endDate: '2026-12-31',
    beginHour: '14:30',
    endHour: '18:00',
    projectionFormat: '2D',
    technology: 'STANDARD',
    promotionTitle: 'Afternoon discount',
    description: 'Discount on afternoon screenings.',
    weekdays: [2, 4],
    branchIds: [1, 2]
  });

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(42),
    };

    service = new PromotionsService(
      repository as unknown as PromotionsRepository,
    );
  });

  it('creates a promotion and returns its ID', async () => {
    const dto = validDto();

    await expect(service.create(dto)).resolves.toEqual({
      promotionId: 42,
    });

    expect(repository.create).toHaveBeenCalledWith(dto);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['percentage', 100],
    ['fixed', 4000],
  ] as const)(
    'accepts the maximum amount for %s',
    async (promotionType, promotionAmount) => {
      await expect(
        service.create({
          ...validDto(),
          promotionType,
          promotionAmount,
        }),
      ).resolves.toEqual({ promotionId: 42 });
    },
  );

  it('rejects percentage amounts above 100', async () => {
    await expect(
      service.create({
        ...validDto(),
        promotionAmount: 100.01,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-02-30', '2026-12-31'],
    ['2026-11-17', '2026-13-01'],
    ['0000-01-01', '2026-12-31'],
    ['17/11/2026', '2026-12-31'],
  ])(
    'rejects invalid dates: %s / %s',
    async (beginDate, endDate) => {
      await expect(
        service.create({
          ...validDto(),
          beginDate,
          endDate,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it('accepts a valid leap day', async () => {
    await expect(
      service.create({
        ...validDto(),
        beginDate: '2028-02-29',
        endDate: '2028-02-29',
      }),
    ).resolves.toEqual({ promotionId: 42 });
  });

  it('rejects an end date before the begin date', async () => {
    await expect(
      service.create({
        ...validDto(),
        beginDate: '2026-12-31',
        endDate: '2026-11-17',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts the same begin and end date', async () => {
    await expect(
      service.create({
        ...validDto(),
        endDate: '2026-11-17',
      }),
    ).resolves.toEqual({ promotionId: 42 });
  });

  it.each([
    [undefined, undefined],
    [null, null],
    [undefined, null],
  ])(
    'accepts all-day promotions with hours %s / %s',
    async (beginHour, endHour) => {
      await expect(
        service.create({
          ...validDto(),
          beginHour,
          endHour,
        }),
      ).resolves.toEqual({ promotionId: 42 });
    },
  );

  it.each([
    ['14:30', undefined],
    [undefined, '18:00'],
    ['14:30', null],
    [null, '18:00'],
  ])(
    'rejects incomplete hour ranges: %s / %s',
    async (beginHour, endHour) => {
      await expect(
        service.create({
          ...validDto(),
          beginHour,
          endHour,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['18:00', '14:30'],
    ['14:30', '14:30'],
    ['22:00', '02:00'],
  ])(
    'rejects invalid hour order: %s / %s',
    async (beginHour, endHour) => {
      await expect(
        service.create({
          ...validDto(),
          beginHour,
          endHour,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(repository.create).not.toHaveBeenCalled();
    },
  );

  it('accepts 24:00 as the end boundary', async () => {
    await expect(
      service.create({
        ...validDto(),
        beginHour: '22:00',
        endHour: '24:00',
      }),
    ).resolves.toEqual({ promotionId: 42 });
  });

  it('rejects 70MM combined with 3D', async () => {
    await expect(
      service.create({
        ...validDto(),
        projectionFormat: '3D',
        technology: '70MM',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts 70MM combined with 2D', async () => {
    await expect(
      service.create({
        ...validDto(),
        projectionFormat: '2D',
        technology: '70MM',
      }),
    ).resolves.toEqual({ promotionId: 42 });
  });

  it('propagates repository failures', async () => {
    const error = new Error('Database unavailable');
    repository.create.mockRejectedValueOnce(error);

    await expect(service.create(validDto())).rejects.toBe(error);
  });
});
