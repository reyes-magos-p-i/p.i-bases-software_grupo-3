export function loadFacebookSdk(): Promise<fb.StatusResponse> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      FB.getLoginStatus((response: fb.StatusResponse) => {
        resolve(response)
      })
    }

    if (window.FB) {
      finish()
      return
    }

    window.fbAsyncInit = function () {
      FB.init({
        appId: import.meta.env.VITE_FACEBOOK_APP_ID,
        cookie: true,
        xfbml: true,
        version: 'v21.0',
      })
      FB.AppEvents.logPageView()
      finish()
    }

    if (document.getElementById('facebook-jssdk')) {
      return
    }

    const js = document.createElement('script')
    js.id = 'facebook-jssdk'
    js.src = 'https://connect.facebook.net/en_US/sdk.js'
    js.async = true
    js.defer = true
    js.onerror = () => reject(new Error('Failed to load Facebook SDK'))
    document.body.appendChild(js)
  })
}