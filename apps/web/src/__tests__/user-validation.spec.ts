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
