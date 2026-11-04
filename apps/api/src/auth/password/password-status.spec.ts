import {
  computePasswordStatus,
  describePasswordExpiry,
} from './password-status';

const HOUR = 60 * 60 * 1000;
// Test plan SCRUM-287: created 01/10/2026 08:00 (Costa Rica, UTC-6), 30 days.
const setAt = new Date('2026-10-01T14:00:00Z');
const credentials = { setAt, expirationDays: 30 };
const at = (isoUtc: string) => new Date(isoUtc).getTime();

describe('computePasswordStatus', () => {
  afterEach(() => jest.useRealTimers());

  it('requires a password only when local credentials do not exist', () => {
    expect(computePasswordStatus(null)).toBe('must_set');
  });

  it('requires a verified password change for an unknown employee password date', () => {
    expect(computePasswordStatus({ setAt: null, expirationDays: 120 })).toBe(
      'expired',
    );
  });

  it.each([
    [{ setAt: new Date('invalid'), expirationDays: 90 }, TypeError],
    [{ setAt: new Date(), expirationDays: 45 }, Error],
    [{ setAt: '2026-10-15', expirationDays: 90 }, TypeError],
  ] as const)(
    'rejects invalid credential metadata: %p',
    (credentials, errorType) => {
      expect(() => computePasswordStatus(credentials as never)).toThrow(
        errorType,
      );
      expect(() => computePasswordStatus(credentials as never)).toThrow(
        'Invalid password credentials status.',
      );
    },
  );

  it.each([
    ['2026-10-15T11:59:59.999Z', 'expired'],
    ['2026-10-15T12:00:00.000Z', 'expired'],
    ['2026-10-15T12:00:00.001Z', 'valid'],
  ] as const)('evaluates the expiry boundary at %s', (expiresAt, expected) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const setAt = new Date(new Date(expiresAt).getTime() - 30 * 86400000);
    expect(computePasswordStatus({ setAt, expirationDays: 30 })).toBe(expected);
  });

  it('expires exactly 720 hours after a 30-day password was set (UT-082, UT-083)', () => {
    expect(computePasswordStatus(credentials, at('2026-10-31T13:59:00Z'))).toBe(
      'valid',
    );
    expect(computePasswordStatus(credentials, at('2026-10-31T14:00:00Z'))).toBe(
      'expired',
    );
  });
});

describe('describePasswordExpiry', () => {
  it.each([
    // UT-080: 72 h + 1 min before expiry, outside the warning window.
    ['2026-10-28T13:59:00Z', 'valid', null],
    // UT-081: exactly 72 h before expiry, the warning starts.
    ['2026-10-28T14:00:00Z', 'valid', 3],
    ['2026-10-29T14:00:00Z', 'valid', 2],
    ['2026-10-30T13:00:00Z', 'valid', 2],
    // UT-082: 1 minute left still counts as 1 day.
    ['2026-10-31T13:59:00Z', 'valid', 1],
    // UT-083: expired passwords never show the warning.
    ['2026-10-31T14:00:00Z', 'expired', null],
  ] as const)('at %s reports %s with %p days left', (now, status, days) => {
    expect(describePasswordExpiry(credentials, at(now))).toEqual({
      status,
      expirationDays: 30,
      expiresInDays: days,
    });
  });

  it('reports the configured period without a warning far from expiry', () => {
    expect(
      describePasswordExpiry(
        { setAt, expirationDays: 120 },
        setAt.getTime() + HOUR,
      ),
    ).toEqual({ status: 'valid', expirationDays: 120, expiresInDays: null });
  });

  it('has no period when the account has no local password', () => {
    expect(describePasswordExpiry(null)).toEqual({
      status: 'must_set',
      expirationDays: null,
      expiresInDays: null,
    });
  });

  it('keeps the period of an employee password with an unknown date', () => {
    expect(
      describePasswordExpiry({ setAt: null, expirationDays: 120 }),
    ).toEqual({ status: 'expired', expirationDays: 120, expiresInDays: null });
  });
});
