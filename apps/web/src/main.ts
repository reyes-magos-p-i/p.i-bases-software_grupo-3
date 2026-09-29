import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/variables.css'
import './styles/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initializeFacebook } from './services/facebook-initialization.service'

const app = createApp(App)
app.use(router)
app.mount('#app')

app.mount('#app')

void initializeFacebook()
