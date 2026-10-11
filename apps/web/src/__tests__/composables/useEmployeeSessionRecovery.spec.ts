import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useEmployeeSessionRecovery } from '@/composables/useEmployeeSessionRecovery'
import {
  invalidateEmployeeSession,
  restoreEmployeeSession,
} from '@/services/employee-session.service'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/services/employee-session.service', () => ({
  invalidateEmployeeSession: vi.fn(),
  restoreEmployeeSession: vi.fn(),
}))

function mountRecovery() {
  let recovery!: ReturnType<typeof useEmployeeSessionRecovery>
  const wrapper = mount(
    defineComponent({
      setup() {
        recovery = useEmployeeSessionRecovery()
        return () => null
      },
    }),
  )
  return { wrapper, recovery }
}

describe('useEmployeeSessionRecovery', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => vi.clearAllMocks())

  it('invalidates the session and returns to the login when it expires', () => {
    const { recovery } = mountRecovery()
    recovery.sessionExpired()
    expect(invalidateEmployeeSession).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ path: '/', query: { login: 'employee', reason: 'expired' } })
  })

  it('keeps the page when the session is still valid', async () => {
    vi.mocked(restoreEmployeeSession).mockResolvedValue({ id: 21 } as never)
    const { recovery } = mountRecovery()
    await recovery.refreshPermissions()
    expect(replace).not.toHaveBeenCalled()
  })

  it('leaves when the session is gone or cannot be verified', async () => {
    vi.mocked(restoreEmployeeSession).mockResolvedValueOnce(null)
    const { recovery } = mountRecovery()
    await recovery.refreshPermissions()
    expect(replace).toHaveBeenLastCalledWith({
      path: '/',
      query: { login: 'employee', reason: 'expired' },
    })

    vi.mocked(restoreEmployeeSession).mockRejectedValueOnce(new Error('offline'))
    await recovery.refreshPermissions()
    expect(replace).toHaveBeenLastCalledWith({
      path: '/',
      query: { login: 'employee', reason: 'unavailable' },
    })
  })

  it('ignores answers that arrive after unmounting', async () => {
    vi.mocked(restoreEmployeeSession).mockRejectedValueOnce(new Error('offline'))
    const { wrapper, recovery } = mountRecovery()
    wrapper.unmount()
    await recovery.refreshPermissions()
    await flushPromises()
    expect(recovery.state.disposed).toBe(true)
    expect(replace).not.toHaveBeenCalled()
  })
})
