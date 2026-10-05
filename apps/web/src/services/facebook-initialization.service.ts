import { loadFacebookSdk } from '../loadFBSDK.js'
import { applyLoginStatus } from '../facebook-auth'
import { facebookLogin } from './authService'

export async function initializeFacebook() {
  try {
    const response = await loadFacebookSdk()
    applyLoginStatus(response)

    if (response.status === 'connected' && response.authResponse?.accessToken) {
      await facebookLogin(response.authResponse.accessToken)
    }
    // not_authorized or unknown, show the login UI
  } catch (error) {
    console.error('Facebook SDK failed', error)
  }
}
