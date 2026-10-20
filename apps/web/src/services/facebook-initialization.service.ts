import { loadFacebookSdk } from '../loadFBSDK.js'
import { applyLoginStatus } from '../facebook-auth'
import {
  clearClientAuth,
  clientSessionRevision,
  CLIENT_ACCESS_TOKEN_KEY,
} from './client-session.service'
import { facebookLogin, getEmployeeSession } from './authService'

export async function initializeFacebook() {
  const revision = clientSessionRevision()
  const hasLocalToken = () => Boolean(localStorage.getItem(CLIENT_ACCESS_TOKEN_KEY))
  try {
    const response = await loadFacebookSdk()
    applyLoginStatus(response)

    if (revision !== clientSessionRevision() || hasLocalToken()) return
    if (response.status === 'connected' && response.authResponse?.accessToken) {
      const employee = await getEmployeeSession()
      if (revision !== clientSessionRevision() || hasLocalToken()) return
      if (employee) {
        await clearClientAuth()
        return
      }
      await facebookLogin(response.authResponse.accessToken, revision)
    }
    // not_authorized or unknown, show the login UI
  } catch (error) {
    console.error('Facebook SDK failed', error)
  }
}
