import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/variables.css'
import './styles/main.css'
import './styles/dashboard.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import vue3GoogleLogin from 'vue3-google-login'
import { initializeFacebook } from './services/facebook-initialization.service'

const app = createApp(App)

app.use(vue3GoogleLogin, {
  clientId: '913566706796-cg960qafeugmdcti1dnp8q95j1jo98lt.apps.googleusercontent.com'
})





app.use(router)
app.mount('#app')

void initializeFacebook()
