import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/variables.css'
import './styles/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadFacebookSdk } from './loadFBSDK.js'
import { applyLoginStatus } from './facebook-auth'

const app = createApp(App)
app.use(router)

try {
  const response = await loadFacebookSdk()
  applyLoginStatus(response)

  if (response.status === 'connected') {
    // Already logged into Facebook and this app, send accessToken to the backend
  }
  // not_authorized or unknown, show the login UI
} catch (err) {
  console.error('Facebook SDK failed', err)
}

app.mount('#app')
