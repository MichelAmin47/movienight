import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The app is served from https://michelamin47.github.io/movienight/
export default defineConfig({
  base: '/movienight/',
  plugins: [react(), tailwindcss()],
})
