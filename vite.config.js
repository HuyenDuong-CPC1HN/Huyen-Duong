import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages phục vụ ở /Huyen-Duong/ (tên repo), Vercel phục vụ ở domain gốc "/" — Vercel tự đặt biến
  // môi trường VERCEL=1 lúc build nên dùng để chọn đúng base cho từng nơi deploy, không cần sửa tay.
  base: process.env.VERCEL ? '/' : '/Huyen-Duong/',
  plugins: [react(), tailwindcss()],
})
