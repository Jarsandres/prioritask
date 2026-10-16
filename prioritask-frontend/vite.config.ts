import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // H2: en producción eliminamos `debugger` y los logs de baja severidad,
  // conservando console.error/console.warn para observabilidad.
  esbuild:
    mode === 'production'
      ? { drop: ['debugger'], pure: ['console.log', 'console.debug', 'console.info'] }
      : {},
  build: {
    // Defensa en profundidad: nunca emitir sourcemaps de producción.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            const normalized = id.replace(/\\/g, '/');
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/react-router/') ||
              normalized.includes('/node_modules/react-router-dom/') ||
              normalized.includes('/node_modules/@remix-run/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (normalized.includes('/node_modules/react-icons/')) {
              return 'vendor-icons';
            }
            if (normalized.includes('/node_modules/react-select/')) {
              return 'vendor-select';
            }
            if (
              normalized.includes('/node_modules/axios/') ||
              normalized.includes('/node_modules/bootstrap/')
            ) {
              return 'vendor-utils';
            }
            return 'vendor-misc';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}))
