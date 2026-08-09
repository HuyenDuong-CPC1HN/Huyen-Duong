import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  // Local `npm run dev` / `vite preview` → "/".
  // `npm run build` trên GitHub Actions → "/Huyen-Duong/" (GitHub Pages).
  // Build trên Vercel (VERCEL=1) → "/".
  base: process.env.VERCEL
    ? '/'
    : command === 'build'
      ? '/Huyen-Duong/'
      : '/',
  plugins: [react(), tailwindcss()],
}))
