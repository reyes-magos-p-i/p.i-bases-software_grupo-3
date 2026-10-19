import { afterEach, describe, expect, it } from 'vitest'
import {
  announcePasswordExpiry,
  dismissPasswordExpiry,
  passwordExpiryMessage,
  passwordExpiryNotice,
} from '@/services/password-expiry-notice'

afterEach(dismissPasswordExpiry)

describe('password expiry notice', () => {
  it.each([
    [3, 'Tu contraseña vence en 3 días. Cámbiala en Perfil > Cambiar contraseña.'],
    [2, 'Tu contraseña vence en 2 días. Cámbiala en Perfil > Cambiar contraseña.'],
    [1, 'Tu contraseña vence en 1 día. Cámbiala en Perfil > Cambiar contraseña.'],
  ])('uses the exact text for %i day(s) left', (days, text) => {
    expect(passwordExpiryMessage(days)).toBe(text)
  })

  it('announces only valid passwords inside the warning window', () => {
    announcePasswordExpiry({ status: 'valid', expirationDays: 30, expiresInDays: 3 })
    expect(passwordExpiryNotice.message.value).toBe(passwordExpiryMessage(3))

    announcePasswordExpiry({ status: 'valid', expirationDays: 30, expiresInDays: null })
    expect(passwordExpiryNotice.message.value).toBe('')

    announcePasswordExpiry({ status: 'expired', expirationDays: 30, expiresInDays: 2 })
    expect(passwordExpiryNotice.message.value).toBe('')
  })

  it('hides the warning when dismissed', () => {
    announcePasswordExpiry({ status: 'valid', expirationDays: 30, expiresInDays: 1 })
    dismissPasswordExpiry()
    expect(passwordExpiryNotice.message.value).toBe('')
  })
})
