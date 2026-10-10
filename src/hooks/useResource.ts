import { useCallback, useEffect, useRef, useState } from 'react';
import { isApiError, type ApiErrorCode } from '@/models/api';

export type ResourceStatus = 'loading' | 'success' | 'error';

export interface Resource<T> {
  status: ResourceStatus;
  data: T | undefined;
  error: ApiErrorCode | null;
  /** Rechargement en cours alors que des données sont déjà affichées. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Charge une ressource asynchrone avec états explicites (chargement / succès / erreur),
 * annulation des réponses obsolètes et rechargement manuel. Les données précédentes restent visibles
 * pendant un rechargement (pas de clignotement).
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: readonly unknown[]): Resource<T> {
  const [state, setState] = useState<{ status: ResourceStatus; data: T | undefined; error: ApiErrorCode | null; refreshing: boolean }>({
    status: 'loading', data: undefined, error: null, refreshing: false,
  });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, status: s.data === undefined ? 'loading' : 'success', refreshing: s.data !== undefined, error: null }));
    fetcherRef.current().then(
      (data) => active && setState({ status: 'success', data, error: null, refreshing: false }),
      (e: unknown) => active && setState((s) => ({ status: 'error', data: s.data, error: isApiError(e) ? e.code : 'unknown', refreshing: false })),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
