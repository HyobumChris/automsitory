import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/automsitory/hatch-coaming-3d/',
  plugins: [react(), tailwindcss()],
})
