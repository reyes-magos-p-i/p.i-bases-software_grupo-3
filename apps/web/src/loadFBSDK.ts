export function loadFacebookSdk() {
  return new Promise((resolve) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }

    window.fbAsyncInit = function () {
      FB.init({
        appId: import.meta.env.VITE_FACEBOOK_APP_ID,
        cookie: true,
        xfbml: true,
        version: 'v21.0'
      });
      FB.AppEvents.logPageView();
      resolve(window.FB);
    };

    const existing = document.getElementById('facebook-jssdk');
    if (existing) return;

    const js = document.createElement('script');
    js.id = 'facebook-jssdk';
    js.src = 'https://connect.facebook.net/en_US/sdk.js';
    js.async = true;
    js.defer = true;
    document.body.appendChild(js);
  });
}