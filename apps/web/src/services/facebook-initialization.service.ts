import { loadFacebookSdk } from '../loadFBSDK.js'
import { applyLoginStatus } from '../facebook-auth'

export async function initializeFacebook() {
  try {
    const response = await loadFacebookSdk()
    applyLoginStatus(response)

    if (response.status === 'connected') {
      // Already logged into Facebook and this app, send accessToken to the backend
    }
    // not_authorized or unknown, show the login UI
  } catch (error) {
    console.error('Facebook SDK failed', error)
  }
}
