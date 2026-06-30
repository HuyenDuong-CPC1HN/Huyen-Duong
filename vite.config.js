import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/n8n-webhook': {
        target: 'https://n8n.cpc1hn.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/n8n-webhook/, ''),
      },
    },
  },
})
