import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AuthProvider } from './auth';
import { ToastProvider } from './components/Toast';
import { DataProvider } from './lib/useQuery';
import './styles.css';
import './glass.css'; // Garage look: loaded last so it only re-skins

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <DataProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </DataProvider>
    </AuthProvider>
  </StrictMode>,
);
