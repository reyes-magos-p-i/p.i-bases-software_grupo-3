import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/variables.css'
import './styles/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
//VUE3 google lib copyright devbaji "https://github.com/devbaji/vue3-google-login"
import vue3GoogleLogin from 'vue3-google-login'

const app = createApp(App)

app.use(vue3GoogleLogin, {
  clientId: '913566706796-cg960qafeugmdcti1dnp8q95j1jo98lt.apps.googleusercontent.com'
})

import { loadFacebookSdk } from './loadFBSDK.js'
import { applyLoginStatus } from './facebook-auth'
import { initializeFacebook } from './services/facebook-initialization.service'


app.use(router)

app.mount('#app')

void initializeFacebook()
