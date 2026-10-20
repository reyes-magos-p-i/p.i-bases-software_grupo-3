import { describe, expect, it } from 'vitest'
import {
  characterCount,
  normalizeMobile,
  validMobile,
  validText,
  validEmail,
} from '@/utils/user-validation'

describe('shared user validation', () => {
  it.each(['88888888', '+506 7777-7777', ' 6666 6666 '])(
    'accepts Costa Rican mobile %s',
    (value) => {
      expect(validMobile(value)).toBe(true)
      expect(normalizeMobile(value)).toMatch(/^[678]\d{7}$/u)
    },
  )
  it.each(['22222222', '+1 88888888', '888888888', '', 'abc'])('rejects mobile %s', (value) => {
    expect(validMobile(value)).toBe(false)
  })
  it('counts Unicode characters independently of storage bytes', () => {
    expect(characterCount('á🎬')).toBe(2)
    expect(validText('é'.repeat(128), 255)).toBe(false)
    expect(validText('é'.repeat(127) + 'a', 255)).toBe(true)
    expect(validText('\uD800', 255)).toBe(false)
  })
  it.each([' Ana@Example.com ', 'a.b@example.com'])('accepts email %s', (value) => {
    expect(validEmail(value)).toBe(true)
  })
  it.each([
    'ana+ventas@cinema.co.cr',
    'ana@cinema.xn--p1ai',
    'ana@sub.cinema.com',
    'josé@cinema.com',
    'a'.repeat(64) + '@example.com',
    'a@' + 'b'.repeat(144) + '.com',
    'a@example..com',
  ])('preserves accepted email formats: %s', (value) => {
    expect(validEmail(value)).toBe(true)
  })
  it.each([
    '',
    '@example.com',
    'ana@',
    'ana@@example.com',
    'ana@example@cinema.com',
    'ana@.com',
    'ana@example.',
    'ana@example',
    'ana @example.com',
    'ana@exam ple.com',
    'ana@exam\tple.com',
    'ana@exam\nple.com',
    'a@' + 'b'.repeat(145) + '.com',
    'é'.repeat(33) + '@example.com',
  ])('rejects malformed or oversized email: %s', (value) => {
    expect(validEmail(value)).toBe(false)
  })
  it('rejects oversized input with repeated domain separators', () => {
    expect(validEmail('a@' + '.'.repeat(100000))).toBe(false)
  })
  it.each([
    'bad',
    'a..b@example.com',
    '.a@example.com',
    'a.@example.com',
    'a@example.c',
    'a\uD800@example.com',
    'a'.repeat(65) + '@example.com',
  ])('rejects email %s', (value) => {
    expect(validEmail(value)).toBe(false)
  })
})
