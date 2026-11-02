import { createHash, timingSafeEqual } from 'node:crypto';

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const GUEST_PURCHASE_CODE =
  /^(?:INV-([1-9]\d{0,15})-[A-F0-9]{64}|([1-9]\d{0,15})\.[0-7][0-9A-HJKMNP-TV-Z]{25})$/u;

function purchaseDigest(id: number, requestKey: string): string {
  // The private random request key keeps receipt access independent of public IDs and email.
  return createHash('sha256')
    .update(`cinetadel:guest-purchase:v1:${id}:${requestKey}`)
    .digest('hex');
}

export function guestPurchaseCode(id: number, requestKey: string): string {
  const value = BigInt('0x' + purchaseDigest(id, requestKey).slice(0, 32));
  const secret = [...value.toString(32).padStart(26, '0')]
    .map((character) => BASE32[Number.parseInt(character, 32)])
    .join('');
  return `${id}.${secret}`;
}

export function normalizeGuestPurchaseCode(code: string): string {
  const value = code.trim().toUpperCase();
  const separator = value.indexOf('.');
  if (separator < 0) return value;
  const secret = value
    .slice(separator + 1)
    .replace(/[ -]/gu, '')
    .replace(/O/gu, '0')
    .replace(/[IL]/gu, '1');
  return value.slice(0, separator + 1) + secret;
}

export function guestPurchaseId(code: string): number | null {
  const match = GUEST_PURCHASE_CODE.exec(normalizeGuestPurchaseCode(code));
  const id = Number(match?.[1] ?? match?.[2]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function matchesGuestPurchaseCode(
  code: string,
  id: number,
  key: string,
): boolean {
  const normalized = normalizeGuestPurchaseCode(code);
  const expected = Buffer.from(
    normalized.startsWith('INV-')
      ? `INV-${id}-${purchaseDigest(id, key).toUpperCase()}`
      : guestPurchaseCode(id, key),
  );
  const actual = Buffer.from(normalized);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
