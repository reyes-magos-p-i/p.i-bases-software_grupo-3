import type { NavigationGuard, Router } from 'vue-router'
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
import { onPasswordBlocked } from '@/services/api'

const PASSWORD_PATH = '/account/password'

export const requireClientSession: NavigationGuard = async (to) => {
  if (to.path === '/recover-password' || to.path === '/account/confirm-email') return true
  const token = localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY)
  try {
    // A stored session is restored before any route (not only client routes), so an
    // expired password redirects before the page is shown, even on a direct page load.
    if (to.meta.requiresClient || (hasClientSession() && !clientSession.user.value)) {
      const identity = await restoreClientSession(getClientSession)
      if (to.meta.requiresClient && !identity) {
        return { path: '/', query: { login: 'client', reason: 'required' } }
      }
    }
    if (!clientSession.user.value || !hasClientSession() || to.path === PASSWORD_PATH) return true
    const { status } = await getClientPasswordStatus()
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

/** Sends a client to the password change when any endpoint rejects an expired password. */
export function redirectClientWhenPasswordBlocked(router: Router): () => void {
  return onPasswordBlocked((reason) => {
    if (!hasClientSession() || router.currentRoute.value.path === PASSWORD_PATH) return
    void router.replace({ path: PASSWORD_PATH, query: { reason } })
  })
}
