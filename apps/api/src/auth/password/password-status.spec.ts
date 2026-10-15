import { computePasswordStatus } from './password-status';

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
    { setAt: new Date('invalid'), expirationDays: 90 },
    { setAt: new Date(), expirationDays: 45 },
    { setAt: '2026-10-15', expirationDays: 90 },
  ])('rejects invalid credential metadata: %p', (credentials) => {
    expect(() => computePasswordStatus(credentials as never)).toThrow(
      'Invalid password credentials status.',
    );
  });

  it.each([
    ['2026-10-15T11:59:59.999Z', 'expired'],
    ['2026-10-15T12:00:00.000Z', 'valid'],
    ['2026-10-15T12:00:00.001Z', 'valid'],
  ] as const)('evaluates the expiry boundary at %s', (expiresAt, expected) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const setAt = new Date(new Date(expiresAt).getTime() - 30 * 86400000);
    expect(computePasswordStatus({ setAt, expirationDays: 30 })).toBe(expected);
  });
});
