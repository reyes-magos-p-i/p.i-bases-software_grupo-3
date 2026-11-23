import { describe, expect, it } from 'vitest'
import { safeRedirectTarget } from '@/utils/safe-redirect'

describe('safeRedirectTarget', () => {
  it.each(['/', '/cancelled-tickets/721', '/account/profile?section=purchases'])(
    'accepts the internal path %s',
    (value) => {
      expect(safeRedirectTarget(value)).toBe(value)
    },
  )

  it.each([
    undefined,
    null,
    42,
    ['/a'],
    '',
    'account/profile',
    '//evil.example',
    'https://evil.example',
    '/\\evil.example',
    '/line\nbreak',
  ])('rejects %j', (value) => {
    expect(safeRedirectTarget(value)).toBeNull()
  })
})
