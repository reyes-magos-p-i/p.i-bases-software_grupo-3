import { loadFacebookSdk } from '../loadFBSDK.js'
import { applyLoginStatus } from '../facebook-auth'
import { clearClientAuth } from './client-session.service'
import { facebookLogin, getEmployeeSession } from './authService'

export async function initializeFacebook() {
  try {
    const response = await loadFacebookSdk()
    applyLoginStatus(response)

    if (response.status === 'connected' && response.authResponse?.accessToken) {
      const employee = await getEmployeeSession()
      if (employee) {
        await clearClientAuth()
        return
      }
      await facebookLogin(response.authResponse.accessToken)
    }
    // not_authorized or unknown, show the login UI
  } catch (error) {
    try {
      await clearClientAuth()
    } catch {}
    console.error('Facebook SDK failed', error)
  }
}
