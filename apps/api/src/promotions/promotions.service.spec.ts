import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionsRepository } from './promotions.repository';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let repository: {
    create: jest.Mock;
    update: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
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
    repository = {
      create: jest.fn().mockResolvedValue(42),
      update: jest.fn().mockResolvedValue(true),
      findAll: jest.fn(),
      findOne: jest.fn(),
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

  describe('findAll', () => {
    it('returns every catalog item, including past and future promotions', async () => {
      const items = [
        { ...listItem, promotionId: 1, beginDate: '2000-01-01', endDate: '2000-12-31' },
        { ...listItem, promotionId: 2, beginDate: '2099-01-01', endDate: '2099-12-31' },
      ];
      repository.findAll.mockResolvedValue(items);
      await expect(service.findAll()).resolves.toBe(items);
      expect(repository.findAll).toHaveBeenCalledTimes(1);
      expect(repository.findAll).toHaveBeenCalledWith();
    });

    it('returns an empty array when the catalog is empty', async () => {
      repository.findAll.mockResolvedValue([]);
      await expect(service.findAll()).resolves.toEqual([]);
    });

    it('propagates database failures', async () => {
      const error = new Error('Database unavailable');
      repository.findAll.mockRejectedValueOnce(error);
      await expect(service.findAll()).rejects.toBe(error);
    });
  });

  describe('findOne', () => {
    it('returns all fields and associations for an existing promotion', async () => {
      repository.findOne.mockResolvedValue(detail);
      await expect(service.findOne(42)).resolves.toBe(detail);
      expect(repository.findOne).toHaveBeenCalledTimes(1);
      expect(repository.findOne).toHaveBeenCalledWith(42);
    });

    it('throws HTTP 404 when the repository returns null', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findOne(999))
        .rejects.toThrow(new NotFoundException('Promotion not found.'));
    });

    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rejects an invalid ID without querying the repository: %s', async (id) => {
        await expect(service.findOne(id)).rejects.toThrow(BadRequestException);
        expect(repository.findOne).not.toHaveBeenCalled();
      },
    );

    it('propagates database failures instead of converting them to 404', async () => {
      const error = new Error('Database unavailable');
      repository.findOne.mockRejectedValueOnce(error);
      await expect(service.findOne(42)).rejects.toBe(error);
    });
  });
  describe('update', () => {
    it('passes the complete edit and returns the existing ID', async () => {
      const dto = validDto();
      await expect(service.update(42, dto)).resolves.toEqual({ promotionId: 42 });
      expect(repository.update).toHaveBeenCalledWith(42, dto);
      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.findOne).not.toHaveBeenCalled();
    });
    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid ID %s before updating', async (id) => {
        await expect(service.update(id, validDto())).rejects.toThrow(BadRequestException);
        expect(repository.update).not.toHaveBeenCalled();
      },
    );
    it('returns 404 when no row was updated', async () => {
      repository.update.mockResolvedValueOnce(false);
      await expect(service.update(999, validDto())).rejects.toThrow(NotFoundException);
    });
    it.each([
      { promotionAmount: 100.01 },
      { beginDate: '2026-02-30' },
      { endDate: '2026-13-01' },
      { beginDate: '0000-01-01' },
      { endDate: '2026-01-01' },
      { beginHour: null, endHour: '18:00' },
      { beginHour: '14:30', endHour: null },
      { beginHour: '18:00', endHour: '18:00' },
      { beginHour: '22:00', endHour: '02:00' },
      { technology: '70MM' as const, projectionFormat: '3D' as const },
    ])('enforces creation business rules for edits: %p', async (changes) => {
      await expect(service.update(42, { ...validDto(), ...changes }))
        .rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });
    it.each([
      { promotionType: 'fixed' as const, promotionAmount: 4000 },
      { promotionType: 'percentage' as const, promotionAmount: 100 },
      { beginHour: null, endHour: null, weekdays: [] },
      { beginHour: '00:00', endHour: '24:00' },
      { beginDate: '2028-02-29', endDate: '2028-02-29' },
      { technology: '70MM' as const, projectionFormat: '2D' as const },
    ])('accepts valid edited boundaries: %p', async (changes) => {
      await expect(service.update(42, { ...validDto(), ...changes }))
        .resolves.toEqual({ promotionId: 42 });
    });
    it('preserves repository exceptions', async () => {
      const error = new BadRequestException('One or more selected cinemas do not exist.');
      repository.update.mockRejectedValueOnce(error);
      await expect(service.update(42, validDto())).rejects.toBe(error);
    });
  });

});
