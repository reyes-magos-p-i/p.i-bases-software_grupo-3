import { createHash, timingSafeEqual } from 'node:crypto';

export const GUEST_PURCHASE_CODE = /^INV-([1-9]\d{0,15})-([a-f0-9]{64})$/iu;

export function guestPurchaseCode(id: number, requestKey: string): string {
  // The private random request key keeps receipt access independent of public IDs and email.
  const digest = createHash('sha256')
    .update(`cinetadel:guest-purchase:v1:${id}:${requestKey}`)
    .digest('hex');
  return `INV-${id}-${digest}`;
}

export function guestPurchaseId(code: string): number | null {
  const match = GUEST_PURCHASE_CODE.exec(code);
  const id = Number(match?.[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function matchesGuestPurchaseCode(
  code: string,
  id: number,
  key: string,
): boolean {
  const expected = Buffer.from(guestPurchaseCode(id, key));
  const actual = Buffer.from(code.toLowerCase().replace(/^inv/u, 'INV'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
