import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 중에는 vite 가 5173 에서 뜨고, /api 와 /ws 는 백엔드(8000)로 넘긴다.
// 운영에서는 nginx 가 같은 일을 한다 (web/nginx.conf).
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.json 의 paths 와 반드시 같이 유지할 것.
    // 여기만 빠지면 타입 검사는 통과하는데 빌드가 깨진다.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/ws': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
