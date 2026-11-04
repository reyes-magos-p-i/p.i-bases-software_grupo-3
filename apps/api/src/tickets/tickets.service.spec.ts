import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { TicketsRepository } from './tickets.repository/tickets.repository';

describe('TicketsService', () => {
  let service: TicketsService;
  let repository: {
    getTicketById: jest.Mock;
    getAlternativeShowtimesByTicketId: jest.Mock;
    updateMovieFunction: jest.Mock;
  };

  const alternatives = [
    {
      movieFunctionId: 12,
      theaterId: 3,
      time: '18:30',
      date: 'x',
      seatRow: 1,
      seatColumn: 1,
    },
    {
      movieFunctionId: 13,
      theaterId: 4,
      time: '21:00',
      date: 'x',
      seatRow: 2,
      seatColumn: 2,
    },
  ];

  beforeEach(async () => {
    repository = {
      getTicketById: jest.fn(),
      getAlternativeShowtimesByTicketId: jest
        .fn()
        .mockResolvedValue(alternatives),
      updateMovieFunction: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: TicketsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateMovieFunction', () => {
    it('moves the ticket to the chosen alternative with that alternative seat row and column', async () => {
      await expect(
        service.updateMovieFunction(1, { movieFunctionId: 13 }),
      ).resolves.toEqual({
        ticketId: 1,
        movieFunctionId: 13,
        theaterId: 4,
        seatRow: 2,
        seatColumn: 2,
      });

      expect(repository.updateMovieFunction).toHaveBeenCalledWith(
        1,
        13,
        4,
        2,
        2,
      );
    });

    it('rejects a movie function that is not one of the alternatives', async () => {
      await expect(
        service.updateMovieFunction(1, { movieFunctionId: 99 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repository.updateMovieFunction).not.toHaveBeenCalled();
    });

    it('throws a conflict when the seat was taken before the update', async () => {
      repository.updateMovieFunction.mockResolvedValue(0);

      await expect(
        service.updateMovieFunction(1, { movieFunctionId: 12 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
