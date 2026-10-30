import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['offline-pole-cannon-journals.trycloudflare.com'],
    port: 3000,
    strictPort: false,
    open: true,
    cors: true
  },
  base: '/'
})
