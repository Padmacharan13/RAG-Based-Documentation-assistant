import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/register': 'http://localhost:8000',
      '/login': 'http://localhost:8000',
      '/upload': 'http://localhost:8000',
      '/documents': 'http://localhost:8000',
      '/ask': 'http://localhost:8000',
      '/query_logs': 'http://localhost:8000',
      '/analytics': 'http://localhost:8000',
    },
  },
})
