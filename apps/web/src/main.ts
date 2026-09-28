import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/variables.css'
import './styles/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadFacebookSdk } from './loadFBSDK.ts'

const app = createApp(App)
app.use(router)

loadFacebookSdk()
  .catch((err) => {
    console.error('Facebook SDK failed to load', err)
  })
  .finally(() => {
    app.mount('#app')
  })
