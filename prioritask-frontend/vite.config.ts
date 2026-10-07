import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:8000/api/v1'),
  },
  build: {
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
              normalized.includes('/node_modules/lodash/') ||
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
})
