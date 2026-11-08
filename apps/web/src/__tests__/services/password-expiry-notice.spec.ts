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
    [3, 'Tu contraseña vence en 3 días. Cámbiala en Mi perfil > Seguridad.'],
    [2, 'Tu contraseña vence en 2 días. Cámbiala en Mi perfil > Seguridad.'],
    [1, 'Tu contraseña vence en 1 día. Cámbiala en Mi perfil > Seguridad.'],
  ])('points a client to Mi perfil > Seguridad with %i day(s) left', (days, text) => {
    expect(passwordExpiryMessage(days, 'client')).toBe(text)
  })

  it.each([
    [3, 'Tu contraseña vence en 3 días. Cámbiala en la sección Cambiar contraseña.'],
    [1, 'Tu contraseña vence en 1 día. Cámbiala en la sección Cambiar contraseña.'],
  ])('points an employee to the Cambiar contraseña section with %i day(s) left', (days, text) => {
    expect(passwordExpiryMessage(days, 'employee')).toBe(text)
  })

  it('never points to the removed Perfil > Cambiar contraseña menu option', () => {
    for (const audience of ['client', 'employee'] as const) {
      expect(passwordExpiryMessage(2, audience)).not.toContain('Perfil > Cambiar contraseña')
    }
  })

  it('announces the text of the audience that logged in', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(2), 'employee')
    expect(passwordExpiryNotice.message.value).toBe(
      'Tu contraseña vence en 2 días. Cámbiala en la sección Cambiar contraseña.',
    )
  })

  it('warns after a login inside the warning window', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(3), 'client')
    expect(passwordExpiryNotice.message.value).toBe(passwordExpiryMessage(3, 'client'))
  })

  it('ignores password checks that do not follow a login, such as a page refresh', () => {
    announcePasswordExpiry(expiringIn(3), 'client')
    expect(passwordExpiryNotice.message.value).toBe('')
  })

  it('warns only once per login', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(2), 'client')
    dismissPasswordExpiry()
    announcePasswordExpiry(expiringIn(2), 'client')
    expect(passwordExpiryNotice.message.value).toBe('')
  })

  it.each([
    ['outside the warning window', expiringIn(null)],
    ['with an expired password', { status: 'expired', expirationDays: 30, expiresInDays: null }],
  ] as const)('consumes the login without warning %s', (_, expiry) => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiry, 'client')
    expect(passwordExpiryNotice.message.value).toBe('')
    announcePasswordExpiry(expiringIn(1), 'client')
    expect(passwordExpiryNotice.message.value).toBe('')
  })

  it('keeps a visible warning when a later check does not follow a login', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(1), 'client')
    announcePasswordExpiry(expiringIn(null), 'client')
    expect(passwordExpiryNotice.message.value).toBe(passwordExpiryMessage(1, 'client'))
  })

  it('hides the warning and forgets an unfinished login when dismissed', () => {
    expectPasswordExpiryNotice()
    announcePasswordExpiry(expiringIn(1), 'client')
    dismissPasswordExpiry()
    expect(passwordExpiryNotice.message.value).toBe('')

    expectPasswordExpiryNotice()
    dismissPasswordExpiry()
    announcePasswordExpiry(expiringIn(1), 'client')
    expect(passwordExpiryNotice.message.value).toBe('')
  })
})
