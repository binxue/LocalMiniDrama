import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: process.env.LOCALMINIDRAMA_FRONTEND_HOST || '0.0.0.0',
    port: Number(process.env.LOCALMINIDRAMA_FRONTEND_PORT) || 3013,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.LOCALMINIDRAMA_BACKEND_URL || 'http://127.0.0.1:5679',
        changeOrigin: true,
        proxyTimeout: 600000,
        timeout: 600000
      },
      '/static': {
        target: process.env.LOCALMINIDRAMA_BACKEND_URL || 'http://127.0.0.1:5679',
        changeOrigin: true
      }
    }
  }
})
