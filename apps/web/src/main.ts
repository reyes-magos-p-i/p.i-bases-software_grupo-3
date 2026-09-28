import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadFacebookSdk } from './loadFBSDK.js'
import { applyLoginStatus } from './facebook-auth'

const app = createApp(App)
app.use(router)

loadFacebookSdk()
  .then((response) => {
    applyLoginStatus(response)

    if (response.status === 'connected') {
      // If it comes here, then user is already logged into Facebook and with us
      // So i must send accessToken to backend
    }
    // if it comes here then user is not_authorized | unknown, so i must show login UI
  })
  .catch((err) => console.error('Facebook SDK failed', err))
  .finally(() => {
    app.mount('#app')
  })