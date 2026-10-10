import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import '@/design-system/styles/tokens.css';
import '@/design-system/styles/base.css';
import '@/design-system/styles/components.css';
import '@/design-system/styles/phone.css';
import '@/design-system/styles/status.css';
import { loadNamespaces } from '@/i18n/core';
import { router } from '@/app/routes/router';

// Le dictionnaire commun est requis par presque tous les composants : on l'attend avant le premier rendu.
void loadNamespaces(['common']).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
