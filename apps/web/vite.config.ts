import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '^/api(?:/|$)': {
        target: 'http://127.0.0.1:3000',
      },
      '^/uploads(?:/|$)': {
        target: 'http://127.0.0.1:3000',
      },
    },
  },
  // Vue DevTools injects a floating panel into every page, so it is opt-in: VITE_VUE_DEVTOOLS=true.
  plugins: [
    vue(),
    tailwindcss(),
    ...(process.env.VITE_VUE_DEVTOOLS === 'true' ? [vueDevTools()] : []),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
