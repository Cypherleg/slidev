import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@dominio': fileURLToPath(new URL('./supabase/functions/_shared/dominio', import.meta.url)),
      '@contrato': fileURLToPath(new URL('./supabase/functions/_shared/api/contrato.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'web/src/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    // Testes de banco criam um banco próprio por arquivo; paralelismo entre arquivos é seguro.
  },
})
