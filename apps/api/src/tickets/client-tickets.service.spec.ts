import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ClientTicketsService } from './client-tickets.service';
import type { TicketsRepository } from './tickets.repository/tickets.repository';
import type { TicketsService } from './tickets.service';

describe('ClientTicketsService', () => {
  const ticket = (functionStatus: string) => ({
    id: 5,
    movieFunctionId: 9,
    title: 'Dune',
    branchName: 'San Pedro',
    theaterId: 2,
    startsAt: '2026-11-14T18:30:00-06:00',
    functionStatus,
    seatRow: 5,
    seatColumn: 7,
  });

  const build = (found: ReturnType<typeof ticket> | null) => {
    const repository = {
      findClientTicket: jest.fn().mockResolvedValue(found),
      getAlternativeShowtimesByTicketId: jest.fn().mockResolvedValue([{ movieFunctionId: 10 }]),
      requestRefund: jest.fn().mockResolvedValue(undefined),
    };
    const tickets = { updateMovieFunction: jest.fn().mockResolvedValue({ ticketId: 5 }) };
    const service = new ClientTicketsService(
      repository as unknown as TicketsRepository,
      tickets as unknown as TicketsService,
    );
    return { service, repository, tickets };
  };

  it('looks tickets up scoped to the client', async () => {
    const { service, repository } = build(ticket('CANCELLED'));
    await service.findTicket(3, 5);
    expect(repository.findClientTicket).toHaveBeenCalledWith(5, 3);
  });

  it('answers not found for missing or foreign tickets', async () => {
    const { service } = build(null);
    await expect(service.findTicket(3, 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('offers alternatives only while the projection is cancelled', async () => {
    const cancelled = await build(ticket('CANCELLED')).service.findTicket(3, 5);
    expect(cancelled.alternatives).toEqual([{ movieFunctionId: 10 }]);

    const active = await build(ticket('ACTIVE')).service.findTicket(3, 5);
    expect(active.alternatives).toEqual([]);
  });

  it('changes showtime only for a cancelled projection', async () => {
    const { service, tickets } = build(ticket('ACTIVE'));
    await expect(service.changeShowtime(3, 5, { movieFunctionId: 10 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tickets.updateMovieFunction).not.toHaveBeenCalled();
  });

  it('delegates the change to the ticket rules when cancelled', async () => {
    const { service, tickets } = build(ticket('CANCELLED'));
    await service.changeShowtime(3, 5, { movieFunctionId: 10 });
    expect(tickets.updateMovieFunction).toHaveBeenCalledWith(5, { movieFunctionId: 10 });
  });

  it('records a refund request for a cancelled projection', async () => {
    const { service, repository } = build(ticket('CANCELLED'));
    await expect(service.requestRefund(3, 5)).resolves.toEqual({
      ticketId: 5,
      status: 'REQUESTED',
      estimatedDays: '5 a 10 días hábiles',
    });
    expect(repository.requestRefund).toHaveBeenCalledWith(5);
  });
});
