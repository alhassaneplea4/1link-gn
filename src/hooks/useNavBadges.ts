import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MUTATION_EVENT, useBadges, type NavCounts, type NavScope } from '@/state/badges';

/** Charge et tient à jour les pastilles d'un espace (client ou admin) tant que son menu est affiché. */
export function useNavBadges(scope: NavScope): NavCounts {
  const counts = useBadges((s) => s[scope]);
  const { pathname } = useLocation();

  // À l'arrivée et à chaque changement de page.
  useEffect(() => void useBadges.getState().refresh(scope), [scope, pathname]);

  useEffect(() => {
    const refresh = () => void useBadges.getState().refresh(scope);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 500); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const every = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(MUTATION_EVENT, soon);
    return () => {
      clearInterval(every);
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(MUTATION_EVENT, soon);
    };
  }, [scope]);

  return counts;
}
