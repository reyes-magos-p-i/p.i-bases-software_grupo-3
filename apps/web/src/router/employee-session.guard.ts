import type { NavigationGuard } from 'vue-router'
import { employeeSession, restoreEmployeeSession } from '@/services/employee-session.service'

export const requireEmployeeSession: NavigationGuard = async (to) => {
  if (!to.meta.requiresEmployee) return true
  const hadSession = !!employeeSession.user.value
  try {
    const identity = await restoreEmployeeSession(true)
    if (identity) return true
    return { path: '/', query: { login: 'employee', reason: hadSession ? 'expired' : 'required' } }
  } catch {
    return { path: '/', query: { login: 'employee', reason: 'unavailable' } }
  }
}
