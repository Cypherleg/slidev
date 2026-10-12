import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const raizProjeto = fileURLToPath(new URL('..', import.meta.url))
const alvoApi = process.env.JORNADA_API_LOCAL ?? 'http://127.0.0.1:8787'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@dominio': fileURLToPath(new URL('../supabase/functions/_shared/dominio', import.meta.url)),
      '@contrato': fileURLToPath(new URL('../supabase/functions/_shared/api/contrato.ts', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: { allow: [raizProjeto] },
    proxy: {
      '/functions/v1': { target: alvoApi, changeOrigin: false },
      '/dev': { target: alvoApi, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
})
