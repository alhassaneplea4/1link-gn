import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { ToastProvider } from '@/components/ui';
import { useSession } from '@/state/session';

/** Racine : fournisseurs globaux, initialisation de la session, restauration du défilement. */
export default function RootLayout() {
  const init = useSession((s) => s.init);
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => void init(), [init]);
  // Bouton « Retour » d'Android : l'application demande au site s'il peut revenir en arrière ; sinon elle propose de quitter.
  useEffect(() => {
    const w = window as unknown as { __onelinkBack?: () => boolean };
    w.__onelinkBack = () => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) { window.history.back(); return true; }
      const parent = pathname.startsWith('/dashboard/') ? '/dashboard' : pathname.startsWith('/admin/') ? '/admin' : pathname.startsWith('/legal/') || pathname === '/features' || pathname === '/pricing' || pathname === '/faq' ? '/' : null;
      if (parent) { void navigate(parent, { replace: true }); return true; }
      return false;
    };
    return () => { delete w.__onelinkBack; };
  }, [navigate, pathname]);
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
