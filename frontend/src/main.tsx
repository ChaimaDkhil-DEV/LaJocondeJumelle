// Police Inter auto-hébergée (CSP font-src 'self'), trois graisses (600 : latin et latin-ext seulement).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import './app/inter-600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { createAppRouter } from './app/routes';

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable');

const router = createAppRouter();

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
