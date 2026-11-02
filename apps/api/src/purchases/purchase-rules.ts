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
import type { UserStatus } from '../users/types/user-status.type';

export function requireGuestEmailAvailable(
  account: { status: UserStatus; verificationPending: boolean } | null,
): void {
  if (!account) return;
  if (account.status === 'INACTIVE')
    throw new ConflictException({
      code: 'CLIENT_ACCOUNT_INACTIVE',
      message:
        'La cuenta asociada a este correo está desactivada. Solicita su reactivación a asistencia o utiliza otro correo.',
    });
  if (account.verificationPending)
    throw new ConflictException({
      code: 'CLIENT_VERIFICATION_REQUIRED',
      message:
        'Este correo tiene un registro pendiente. Confirma tu correo para utilizar tu cuenta o solicita otro enlace desde el registro.',
    });
  throw new ConflictException({
    code: 'CLIENT_LOGIN_REQUIRED',
    message:
      'Ya existe una cuenta con este correo. Inicia sesión para continuar con la compra.',
  });
}

export const MAX_TICKETS_PER_PURCHASE = 10;
export const MAX_GUEST_PURCHASES_PER_HOUR = 3;
const TICKET_LIMIT_MESSAGE = `Puedes comprar hasta ${MAX_TICKETS_PER_PURCHASE} boletos por función.`;

export function requireTicketAllowance(owned: number, requested: number) {
  if (owned + requested > MAX_TICKETS_PER_PURCHASE)
    throw new ConflictException({
      code: 'TICKET_LIMIT_REACHED',
      message: `${TICKET_LIMIT_MESSAGE} Ya tienes ${owned} para esta función.`,
    });
}

export function requireGuestPurchaseAllowance(recent: number) {
  if (recent >= MAX_GUEST_PURCHASES_PER_HOUR)
    throw new ConflictException({
      code: 'GUEST_EMAIL_LIMIT',
      message:
        'Este correo alcanzó el máximo de compras por hora. Intenta más tarde.',
    });
}

export function selectionPositions(selection: PurchaseSelection) {
  const positions = TICKET_CATEGORIES.flatMap(
    (category) => selection.seats[category],
  );
  if (!positions.length)
    throw new BadRequestException(
      'Selecciona al menos un asiento para continuar.',
    );
  if (positions.length > MAX_TICKETS_PER_PURCHASE)
    throw new BadRequestException(TICKET_LIMIT_MESSAGE);
  if (new Set(positions).size !== positions.length)
    throw new BadRequestException('Un asiento no puede repetirse.');
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
export function purchaseQrPayload(reference: string): string {
  return JSON.stringify({ type: 'CINETADEL_PURCHASE', version: 1, reference });
}
