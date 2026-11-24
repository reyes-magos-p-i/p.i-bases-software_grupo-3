import type { NavigationGuard } from 'vue-router'
import { employeeSession, restoreEmployeeSession } from '@/services/employee-session.service'

export const requireEmployeeSession: NavigationGuard = async (to) => {
  const home = to.path === '/'
  if (!to.meta.requiresEmployee && !home) return true
  if (
    home &&
    employeeSession.status.value === 'error' &&
    to.query.login === 'employee' &&
    to.query.reason === 'unavailable'
  )
    return true
  const hadSession = !!employeeSession.user.value
  try {
    const identity = await restoreEmployeeSession(!!to.meta.requiresEmployee)
    if (home) return identity ? { path: '/dashboard', replace: true } : true
    if (identity) return true
    return { path: '/', query: { login: 'employee', reason: hadSession ? 'expired' : 'required' } }
  } catch {
    if (home) return true
    return { path: '/', query: { login: 'employee', reason: 'unavailable' } }
  }
}
