import type { NavigationGuard } from 'vue-router'
import {
  clientSession,
  hasClientSession,
  restoreClientSession,
  clearClientSession,
  reportClientSessionError,
  CLIENT_ACCESS_TOKEN_KEY,
} from '@/services/client-session.service'
import { getClientPasswordStatus, getClientSession } from '@/services/authService'
import { authErrorStatus } from '@/utils/auth-errors'

const PASSWORD_PATH = '/account/password'

export const requireClientSession: NavigationGuard = async (to) => {
  if (to.path === '/recover-password') return true
  const token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
  try {
    if (to.meta.requiresClient && !(await restoreClientSession(getClientSession))) {
      return { path: '/', query: { login: 'client', reason: 'required' } }
    }
    if (!clientSession.user.value || !hasClientSession() || to.path === PASSWORD_PATH) return true
    const status = await getClientPasswordStatus()
    if (status !== 'valid') {
      return { path: PASSWORD_PATH, query: { reason: status } }
    }
  } catch (error) {
    if (token !== localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)) return false
    reportClientSessionError(error)
    if (authErrorStatus(error) === 401) {
      clearClientSession()
      return { path: '/', query: { login: 'client', reason: 'expired' } }
    }
    if (to.meta.requiresClient) {
      return { path: '/', query: { login: 'client', reason: 'unavailable' } }
    }
  }
  return true
}
