import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // MARS OS backend (server/index.ts): on-demand elevation + Gemini. The API key stays there.
    proxy: { '/api': 'http://localhost:8787' },
  },
})
