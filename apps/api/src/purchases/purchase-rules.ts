import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  TICKET_CATEGORIES,
  TICKET_POLICY,
  ticketPrice,
  ticketProductCode,
  type TicketCategory,
} from '../common/pricing/ticket-pricing';
import type {
  PurchaseFunction,
  PurchaseSeat,
  PurchaseSelection,
  PurchaseQuote,
  PurchaseLine,
  PurchasePromotion,
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

export function requireTicketAllowance(
  owned: number,
  requested: number,
  maxTickets: number,
) {
  const ownedNote = owned ? ` Ya tienes ${owned} para esta función.` : '';
  if (owned + requested > maxTickets)
    throw new ConflictException({
      code: 'TICKET_LIMIT_REACHED',
      message: `Puedes comprar hasta ${maxTickets} boletos por función.${ownedNote}`,
    });
}

export function requireGuestPurchaseAllowance(
  recent: number,
  maxGuestPurchases: number,
) {
  if (recent >= maxGuestPurchases)
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
        ...(selection.promotionId == null ? {} : { promotionId: selection.promotionId }),
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
// The promotion must be the one the client selected and have a valid amount.
function requireValidPromotion(
  selection: PurchaseSelection,
  promotion?: PurchasePromotion,
): void {
  if ((selection.promotionId ?? null) !== (promotion?.promotionId ?? null))
    throw new ConflictException({ code: 'PROMOTION_UNAVAILABLE', message: 'Actualiza la promoción seleccionada.' });
  if (promotion && (!Number.isFinite(promotion.promotionAmount) || promotion.promotionAmount < 0.01 ||
      !['fixed', 'percentage'].includes(promotion.promotionType) ||
      promotion.promotionAmount > (promotion.promotionType === 'percentage' ? 100 : 4000)))
    throw new ConflictException('La promoción tiene un monto inválido.');
}
// Ticket rate for one category, with the promotion discount applied if any.
function promotedRate(
  context: PurchaseFunction,
  category: TicketCategory,
  vip: boolean,
  promotion?: PurchasePromotion,
) {
  const rate = ticketPrice(context, category, vip);
  if (!promotion) return rate;
  const cents = Math.round(rate.unitPrice * 100);
  const amountCents = Math.round(promotion.promotionAmount * 100);
  const discount = Math.min(cents, promotion.promotionType === 'fixed'
    ? amountCents : Math.round(cents * amountCents / 10000));
  rate.unitPrice = (cents - discount) / 100;
  rate.modifiers.push({ label: `Promoción: ${promotion.promotionTitle}`, amount: -discount / 100 });
  return rate;
}
export function purchaseQuote(
  context: PurchaseFunction,
  seats: PurchaseSeat[],
  selection: PurchaseSelection,
  promotion?: PurchasePromotion,
): PurchaseQuote {
  requireAvailableFunction(context);
  requireValidPromotion(selection, promotion);
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
  let originalCents = 0;
  for (const seat of chosen) {
    const vip = seat.type === 'vip';
    const code = ticketProductCode(seat.category, vip);
    originalCents += Math.round(ticketPrice(context, seat.category, vip).unitPrice * 100);
    let line = grouped.get(code);
    if (!line) {
      const rate = promotedRate(context, seat.category, vip, promotion);
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
    line.subtotal = Math.round(line.unitPrice * 100) * line.quantity / 100;
  }
  const lines = [...grouped.values()];
  const version = createHash('sha256')
    .update(
      JSON.stringify({
        selection: selectionHash(selection),
        ...(promotion ? { promotion: [promotion.promotionId, promotion.promotionTitle, promotion.promotionType, promotion.promotionAmount] } : {}),
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
  const totalCents = lines.reduce((total, line) => total + Math.round(line.subtotal * 100), 0);
  return {
    ...(promotion ? { discount: {
      promotion: { promotionId: promotion.promotionId, promotionTitle: promotion.promotionTitle,
        promotionType: promotion.promotionType, promotionAmount: promotion.promotionAmount },
      originalTotal: originalCents / 100,
      discountTotal: (originalCents - totalCents) / 100,
    } } : {}),
    function: context,
    seats: chosen,
    lines,
    total: totalCents / 100,
    quantity: chosen.length,
    version,
  };
}
export function purchaseQrPayload(reference: string): string {
  return JSON.stringify({ type: 'CINETADEL_PURCHASE', version: 1, reference });
}
