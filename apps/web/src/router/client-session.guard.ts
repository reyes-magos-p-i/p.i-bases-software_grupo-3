import type { NavigationGuard } from 'vue-router'
import { clientSession, hasClientSession } from '@/services/client-session.service'
import { getClientPasswordStatus } from '@/services/authService'

const PASSWORD_PATH = '/account/password'

export const requireClientSession: NavigationGuard = async (to) => {
  if (to.meta.requiresClient && !clientSession.user.value && !hasClientSession()) {
    return { path: '/', query: { login: 'client', reason: 'required' } }
  }

  if (!clientSession.user.value || to.path === PASSWORD_PATH) return true

  try {
    const status = await getClientPasswordStatus()
    if (status !== 'valid') {
      return { path: PASSWORD_PATH, query: { reason: status } }
    }
  } catch {
    // If the password status check fails, we don't want to block the user from accessing the app.
    // It retries the check on every navigation, so a temporary failure will be retried later.
  }
  return true
}