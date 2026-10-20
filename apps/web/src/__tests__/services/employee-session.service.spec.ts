import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmployeeIdentity } from '@/types/employee-auth'

const { getEmployeeSession, loginEmployee, logoutEmployee } = vi.hoisted(() => ({
  getEmployeeSession: vi.fn(),
  loginEmployee: vi.fn(),
  logoutEmployee: vi.fn(),
}))
vi.mock('@/services/authService', () => ({
  getEmployeeSession,
  loginEmployee,
  logoutEmployee,
  EmployeeAuthError: class extends Error {},
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('employee session', () => {
  let session: typeof import('@/services/employee-session.service')
  const admin: EmployeeIdentity = { id: 21, role: 'ADMINISTRATOR', firstName: 'Ana' }
  const employee: EmployeeIdentity = { id: 22, role: 'EMPLOYEE', firstName: 'Ana' }
  const credentials = { email: 'staff@example.com', password: 'Password' }

  beforeEach(async () => {
    vi.resetModules()
    getEmployeeSession.mockReset().mockResolvedValue(admin)
    loginEmployee.mockReset().mockResolvedValue(employee)
    logoutEmployee.mockReset().mockResolvedValue(undefined)
    session = await import('@/services/employee-session.service')
  })

  it('recovers identity once and revalidates only when requested', async () => {
    expect(session.employeeSession.status.value).toBe('unknown')
    expect(session.restoreEmployeeSession()).toBe(session.restoreEmployeeSession())
    await session.restoreEmployeeSession()
    expect(session.employeeSession.user.value).toEqual(admin)
    expect(session.employeeSession.status.value).toBe('authenticated')
    await session.restoreEmployeeSession()
    expect(getEmployeeSession).toHaveBeenCalledTimes(1)
    getEmployeeSession.mockResolvedValue(employee)
    await session.restoreEmployeeSession(true)
    expect(session.employeeSession.user.value).toEqual(employee)
  })

  it('distinguishes no session from a network failure and supports recovery', async () => {
    getEmployeeSession.mockResolvedValueOnce(null)
    expect(await session.restoreEmployeeSession()).toBeNull()
    expect(session.employeeSession.status.value).toBe('anonymous')
    await session.restoreEmployeeSession()
    expect(getEmployeeSession).toHaveBeenCalledTimes(1)
    getEmployeeSession.mockRejectedValueOnce(new Error('Connection failed'))
    await expect(session.restoreEmployeeSession(true)).rejects.toThrow('Connection failed')
    expect(session.employeeSession.status.value).toBe('error')
    expect(session.employeeSession.error.value).toBe('Connection failed')
    await session.restoreEmployeeSession()
    expect(session.employeeSession.user.value).toEqual(admin)
    expect(session.employeeSession.error.value).toBe('')
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores a stale recovery after login: %s',
    async (outcome) => {
      const recovery = deferred<EmployeeIdentity | null>()
      getEmployeeSession.mockReturnValueOnce(recovery.promise)
      const recovering = session.restoreEmployeeSession()
      await session.authenticateEmployee(credentials)
      if (outcome === 'resolve') recovery.resolve(admin)
      else recovery.reject(new Error('Old failure'))
      expect(await recovering).toEqual(employee)
      expect(session.employeeSession.user.value).toEqual(employee)
      expect(session.employeeSession.error.value).toBe('')
    },
  )

  it('waits for login when recovery overlaps and prevents concurrent mutations', async () => {
    const login = deferred<EmployeeIdentity>()
    loginEmployee.mockReturnValueOnce(login.promise)
    const signingIn = session.authenticateEmployee(credentials)
    const restoring = session.restoreEmployeeSession(true)
    await expect(session.authenticateEmployee(credentials)).rejects.toThrow('Espera')
    await expect(session.closeEmployeeSession()).rejects.toThrow('Espera')
    expect(getEmployeeSession).not.toHaveBeenCalled()
    login.resolve(employee)
    expect(await signingIn).toEqual(employee)
    expect(await restoring).toEqual(employee)
    expect(loginEmployee).toHaveBeenCalledExactlyOnceWith(credentials)
  })

  it('does not resurrect identity after invalidation', async () => {
    const recovery = deferred<EmployeeIdentity | null>()
    getEmployeeSession.mockReturnValueOnce(recovery.promise)
    const pending = session.restoreEmployeeSession()
    session.invalidateEmployeeSession()
    recovery.resolve(admin)
    expect(await pending).toBeNull()
    expect(session.employeeSession.status.value).toBe('anonymous')
  })

  it('does not apply a late login response after invalidation', async () => {
    const login = deferred<EmployeeIdentity>()
    loginEmployee.mockReturnValueOnce(login.promise)
    const pending = session.authenticateEmployee(credentials)
    session.invalidateEmployeeSession()
    login.resolve(employee)
    expect(await pending).toBeNull()
    expect(session.employeeSession.user.value).toBeNull()
  })

  it('clears state after confirmed logout and preserves it if logout fails', async () => {
    await session.restoreEmployeeSession()
    logoutEmployee.mockRejectedValueOnce(new Error('Network failure'))
    await expect(session.closeEmployeeSession()).rejects.toThrow('Network failure')
    expect(session.employeeSession.user.value).toEqual(admin)
    expect(session.employeeSession.error.value).toBe('Network failure')
    await session.closeEmployeeSession()
    expect(session.employeeSession.user.value).toBeNull()
    expect(session.employeeSession.status.value).toBe('anonymous')
    expect(session.employeeSession.error.value).toBe('')
  })

  it('never keeps the previous identity after a failed login', async () => {
    await session.restoreEmployeeSession()
    loginEmployee.mockRejectedValueOnce(new Error('Incorrect credentials'))
    await expect(session.authenticateEmployee(credentials)).rejects.toThrow('Incorrect credentials')
    expect(session.employeeSession.user.value).toBeNull()
    expect(session.employeeSession.status.value).toBe('anonymous')
  })
})
