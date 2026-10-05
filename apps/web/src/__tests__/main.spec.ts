import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  mount: vi.fn(),
  use: vi.fn(),
  load: vi.fn(),
  apply: vi.fn(),
  facebookLogin: vi.fn(),
  getEmployeeSession: vi.fn(),
  clearClientAuth: vi.fn(),
}))
vi.mock('vue', () => ({ createApp: () => ({ use: mocks.use, mount: mocks.mount }) }))
vi.mock('../App.vue', () => ({ default: {} }))
vi.mock('../router', () => ({ default: {} }))
vi.mock('../loadFBSDK.js', () => ({ loadFacebookSdk: mocks.load }))
vi.mock('../facebook-auth', () => ({ applyLoginStatus: mocks.apply }))
vi.mock('../services/authService', () => ({
  facebookLogin: mocks.facebookLogin,
  getEmployeeSession: mocks.getEmployeeSession,
}))
vi.mock('../services/client-session.service', () => ({ clearClientAuth: mocks.clearClientAuth }))

describe('Application startup with Facebook', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    mocks.getEmployeeSession.mockResolvedValue(null)
  })

  afterEach(() => vi.restoreAllMocks())

  it.each(['connected', 'unknown', 'not_authorized'] as const)(
    'mounts immediately and later applies Facebook status %s',
    async (status) => {
      let resolve!: (value: { status: typeof status }) => void
      mocks.load.mockReturnValue(
        new Promise((done) => {
          resolve = done
        }),
      )
      await import('../main')
      expect(mocks.mount).toHaveBeenCalledExactlyOnceWith('#app')
      expect(mocks.mount.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.load.mock.invocationCallOrder[0]!,
      )
      expect(mocks.apply).not.toHaveBeenCalled()
      const response = { status }
      resolve(response)
      await flushPromises()
      expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(response)
      expect(mocks.mount).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps the portal mounted when Facebook fails', async () => {
    const failure = new Error('SDK unavailable')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.load.mockRejectedValue(failure)
    await import('../main')
    await flushPromises()
    expect(mocks.mount).toHaveBeenCalledExactlyOnceWith('#app')
    expect(log).toHaveBeenCalledWith('Facebook SDK failed', failure)
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('keeps the portal mounted when SDK loading throws synchronously', async () => {
    const failure = new Error('SDK initialization failed')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.load.mockImplementation(() => {
      throw failure
    })

    await import('../main')
    await flushPromises()

    expect(mocks.mount).toHaveBeenCalledExactlyOnceWith('#app')
    expect(log).toHaveBeenCalledWith('Facebook SDK failed', failure)
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('keeps the portal mounted when applying Facebook status fails', async () => {
    const response = { status: 'connected' }
    const failure = new Error('Status update failed')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.load.mockResolvedValue(response)
    mocks.apply.mockImplementation(() => {
      throw failure
    })

    await import('../main')
    await flushPromises()

    expect(mocks.mount).toHaveBeenCalledExactlyOnceWith('#app')
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(response)
    expect(log).toHaveBeenCalledWith('Facebook SDK failed', failure)
  })
})
