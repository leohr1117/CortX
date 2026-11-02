import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { SERVER_PORT } from './shared/kern/grenzen.ts';
import { setzeSwCache } from './shared/kern/sw.ts';
import { AKTUELLE_VERSION } from './shared/versionen.ts';

const port = Number(process.env.PORT ?? SERVER_PORT);

function serviceWorkerVersion(): Plugin {
  let ausgabe = '';
  return {
    name: 'cortx-sw-version',
    configResolved(config) {
      ausgabe = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pfad = (req.url ?? '').split('?')[0];
        if (pfad !== '/sw.js') {
          next();
          return;
        }
        const quelle = fs.readFileSync(path.resolve(server.config.root, 'public', 'sw.js'), 'utf8');
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.end(setzeSwCache(quelle, AKTUELLE_VERSION));
      });
    },
    writeBundle() {
      const ziel = path.join(ausgabe, 'sw.js');
      const quelle = fs.readFileSync(ziel, 'utf8');
      fs.writeFileSync(ziel, setzeSwCache(quelle, AKTUELLE_VERSION));
    },
  };
}

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss(), serviceWorkerVersion()],
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
