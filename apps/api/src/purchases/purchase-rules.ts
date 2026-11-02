import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  TICKET_CATEGORIES,
  TICKET_POLICY,
  ticketPrice,
  ticketProductCode,
} from '../common/pricing/ticket-pricing';
import type {
  PurchaseFunction,
  PurchaseSeat,
  PurchaseSelection,
  PurchaseQuote,
  PurchaseLine,
} from './purchase.types';
export function selectionPositions(selection: PurchaseSelection) {
  const positions = TICKET_CATEGORIES.flatMap(
    (category) => selection.seats[category],
  );
  if (!positions.length)
    throw new BadRequestException(
      'Selecciona al menos un asiento para continuar.',
    );
  if (positions.length > 10000 || new Set(positions).size !== positions.length)
    throw new BadRequestException(
      'Un asiento no puede repetirse ni superar la capacidad de la sala.',
    );
  return positions.sort((a, b) => a - b);
}
export function selectionHash(selection: PurchaseSelection) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        functionId: selection.functionId,
        seats: TICKET_CATEGORIES.map((category) => [
          category,
          [...selection.seats[category]].sort((a, b) => a - b),
        ]),
      }),
    )
    .digest('hex');
}
export function requireAvailableFunction(
  context: PurchaseFunction | null,
): asserts context is PurchaseFunction {
  if (!context?.available)
    throw new ConflictException({
      code: 'FUNCTION_UNAVAILABLE',
      message:
        'La función ya comenzó o dejó de estar disponible. Selecciona otra función.',
    });
}
export function purchaseQuote(
  context: PurchaseFunction,
  seats: PurchaseSeat[],
  selection: PurchaseSelection,
): PurchaseQuote {
  requireAvailableFunction(context);
  const positions = selectionPositions(selection);
  const byPosition = new Map(seats.map((seat) => [seat.positionId, seat]));
  const unavailable = positions.filter(
    (position) => byPosition.get(position)?.state !== 'free',
  );
  if (unavailable.length)
    throw new ConflictException({
      code: 'SEATS_UNAVAILABLE',
      message:
        'Algunos asientos ya no están disponibles. Actualiza tu selección.',
      positions: unavailable,
    });
  const chosen = TICKET_CATEGORIES.flatMap((category) =>
    [...selection.seats[category]]
      .sort((a, b) => a - b)
      .map((position) => ({ ...byPosition.get(position)!, category })),
  );
  const grouped = new Map<string, PurchaseLine>();
  for (const seat of chosen) {
    const vip = seat.type === 'vip';
    const code = ticketProductCode(seat.category, vip);
    let line = grouped.get(code);
    if (!line) {
      const rate = ticketPrice(context, seat.category, vip);
      line = {
        code,
        category: seat.category,
        label: `${TICKET_POLICY.categories.find((item) => item.code === seat.category)!.label}${vip ? ' · VIP' : ''}`,
        vip,
        quantity: 0,
        ...rate,
        subtotal: 0,
      };
      grouped.set(code, line);
    }
    line.quantity++;
    line.subtotal += line.unitPrice;
  }
  const lines = [...grouped.values()];
  const version = createHash('sha256')
    .update(
      JSON.stringify({
        selection: selectionHash(selection),
        context: [
          context.id,
          context.movieId,
          context.title,
          context.branchId,
          context.theaterId,
          context.rows,
          context.columns,
          context.startsAt,
          context.endsAt,
          context.format,
          context.technology,
          context.isPremiere,
        ],
        seats: chosen
          .map((seat) => [seat.positionId, seat.type])
          .sort((a, b) => Number(a[0]) - Number(b[0])),
        lines,
      }),
    )
    .digest('hex');
  return {
    function: context,
    seats: chosen,
    lines,
    total: lines.reduce((total, line) => total + line.subtotal, 0),
    quantity: chosen.length,
    version,
  };
}
