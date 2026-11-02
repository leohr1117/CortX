import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import { registriereServiceWorker } from './pwa.ts';
import { setzeSystem } from './ui/system.ts';
import './ui/cortx.css';

setzeSystem();
registriereServiceWorker();

const wurzel = document.getElementById('root');
if (!wurzel) throw new Error('Missing #root.');

createRoot(wurzel).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
