import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => {
  // Local `npm run dev` / `vite preview` → "/".
  // `npm run build` trên GitHub Actions → "/Huyen-Duong/" (GitHub Pages).
  // Build trên Vercel (VERCEL=1) → "/".
  let base = '/'
  if (!process.env.VERCEL && command === 'build') {
    base = '/Huyen-Duong/'
  }

  return {
    base,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [react(), tailwindcss()],
  }
})
