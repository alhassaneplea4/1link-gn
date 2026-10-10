import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/ui';
import { useSession } from '@/state/session';

/** Racine : fournisseurs globaux, initialisation de la session, restauration du défilement. */
export default function RootLayout() {
  const init = useSession((s) => s.init);
  const { hash } = useLocation();
  useEffect(() => void init(), [init]);
  // Défilement vers les ancres internes (#features, #audiences…) de la page d'accueil.
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 60);
    return () => clearTimeout(t);
  }, [hash]);
  return (
    <ToastProvider>
      <Outlet />
      <ScrollRestoration getKey={(loc) => (loc.hash ? loc.key : loc.pathname)} />
    </ToastProvider>
  );
}
