import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // Os testes puros (F1, F2 e a camada de apresentação) rodam em `node`, que é mais rápido.
    // Teste de componente declara `// @vitest-environment jsdom` na primeira linha do arquivo.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
