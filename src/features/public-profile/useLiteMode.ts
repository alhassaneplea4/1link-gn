import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { safeStorage } from '@/utilities/storage';

const KEY = 'onelink.lite';

interface NetworkInformation { saveData?: boolean; effectiveType?: string }

/** Détecte une connexion à économiser : option « économiseur de données » du navigateur ou réseau 2G. */
export function connectionWantsLite(): boolean {
  const c = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return Boolean(c?.saveData) || c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g';
}

/**
 * Mode économe en données. Priorité : paramètre `?lite=1|0` (lien partageable « version légère »),
 * puis choix mémorisé du visiteur, puis détection automatique de la connexion.
 */
export function useLiteMode(): [boolean, () => void] {
  const [params] = useSearchParams();
  const [lite, setLite] = useState<boolean>(() => {
    const q = params.get('lite');
    if (q === '1') return true;
    if (q === '0') return false;
    const stored = safeStorage.get(KEY);
    if (stored === '1' || stored === '0') return stored === '1';
    return connectionWantsLite();
  });
  const toggle = useCallback(() => {
    setLite((v) => {
      safeStorage.set(KEY, v ? '0' : '1');
      return !v;
    });
  }, []);
  return [lite, toggle];
}
