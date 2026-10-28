import { describe, expect, it, vi } from 'vitest'
import { notifyPasswordBlocked, onPasswordBlocked } from '@/services/api'

const response = (status: number, data: unknown) => ({
  isAxiosError: true,
  response: { status, data },
})

describe('password blocked notifications', () => {
  it.each([
    ['PASSWORD_EXPIRED', 'expired'],
    ['PASSWORD_MUST_SET', 'must_set'],
  ])('notifies listeners when any endpoint answers 403 %s', (code, reason) => {
    const listener = vi.fn()
    const stop = onPasswordBlocked(listener)
    notifyPasswordBlocked(response(403, { code, message: 'x' }))
    stop()
    expect(listener).toHaveBeenCalledExactlyOnceWith(reason)
  })

  it.each([
    ['another 403', response(403, { code: 'FORBIDDEN' })],
    ['a 403 without a body', response(403, undefined)],
    ['a 401', response(401, { code: 'PASSWORD_EXPIRED' })],
    ['a network failure', { isAxiosError: true }],
    ['a non-HTTP error', new Error('PASSWORD_EXPIRED')],
  ])('ignores %s', (_, error) => {
    const listener = vi.fn()
    const stop = onPasswordBlocked(listener)
    notifyPasswordBlocked(error)
    stop()
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying a listener after it unsubscribes', () => {
    const listener = vi.fn()
    onPasswordBlocked(listener)()
    notifyPasswordBlocked(response(403, { code: 'PASSWORD_EXPIRED' }))
    expect(listener).not.toHaveBeenCalled()
  })
})
