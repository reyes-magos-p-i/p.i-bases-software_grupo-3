import { afterEach, describe, expect, it } from 'vitest'
import {
  announcePasswordExpiry,
  dismissPasswordExpiry,
  expectPasswordExpiryNotice,
  passwordExpiryMessage,
  passwordExpiryNotice,
} from '@/services/password-expiry-notice'
import type { PasswordExpiry } from '@/services/authService'

const expiringIn = (days: number | null): PasswordExpiry => ({
  status: 'valid',
  expirationDays: 30,
  expiresInDays: days,
})

afterEach(dismissPasswordExpiry)

describe('password expiry notice', () => {
  it.each([
    [3, 'Tu contraseña vence en 3 días. Cámbiala en Perfil > Cambiar contraseña.'],
    [2, 'Tu contraseña vence en 2 días. Cámbiala en Perfil > Cambiar contraseña.'],
    [1, 'Tu contraseña vence en 1 día. Cámbiala en Perfil > Cambiar contraseña.'],
  ])('uses the exact text for %i day(s) left', (days, text) => {
    expect(passwordExpiryMessage(days)).toBe(text)
  })

  it('warns after a login inside the warning window', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(3))
    expect(passwordExpiryNotice.message.value).toBe(passwordExpiryMessage(3))
  })

  it('ignores password checks that do not follow a login, such as a page refresh', () => {
    announcePasswordExpiry(expiringIn(3))
    expect(passwordExpiryNotice.message.value).toBe('')
  })

  it('warns only once per login', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(2))
    dismissPasswordExpiry()
    announcePasswordExpiry(expiringIn(2))
    expect(passwordExpiryNotice.message.value).toBe('')
  })

  it.each([
    ['outside the warning window', expiringIn(null)],
    ['with an expired password', { status: 'expired', expirationDays: 30, expiresInDays: null }],
  ] as const)('consumes the login without warning %s', (_, expiry) => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiry)
    expect(passwordExpiryNotice.message.value).toBe('')
    announcePasswordExpiry(expiringIn(1))
    expect(passwordExpiryNotice.message.value).toBe('')
  })

  it('keeps a visible warning when a later check does not follow a login', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(1))
    announcePasswordExpiry(expiringIn(null))
    expect(passwordExpiryNotice.message.value).toBe(passwordExpiryMessage(1))
  })

  it('hides the warning and forgets an unfinished login when dismissed', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(1))
    dismissPasswordExpiry()
    expect(passwordExpiryNotice.message.value).toBe('')

    expectPasswordExpiryNotice()
    dismissPasswordExpiry()
    announcePasswordExpiry(expiringIn(1))
    expect(passwordExpiryNotice.message.value).toBe('')
  })
})
