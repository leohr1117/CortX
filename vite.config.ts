import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { SERVER_PORT } from './shared/kern/grenzen.ts';

const port = Number(process.env.PORT ?? SERVER_PORT);

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': `http://127.0.0.1:${port}`,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
