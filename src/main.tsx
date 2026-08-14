import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ensurePdfJsPolyfills } from './lib/polyfills';
import './index.css';
import App from './App.tsx';

ensurePdfJsPolyfills();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
