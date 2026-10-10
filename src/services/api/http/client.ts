import { env } from '@/app/configuration/env';
import { ApiError, type ApiErrorCode } from '@/models/api';

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** La couche session s'abonne pour réagir à une session expirée détectée par n'importe quel appel. */
export const onUnauthorized = (cb: Listener) => {
  unauthorizedListeners.add(cb);
  return () => void unauthorizedListeners.delete(cb);
};

const codeFromStatus = (s: number): ApiErrorCode =>
  s === 401 ? 'unauthorized' : s === 403 ? 'forbidden' : s === 404 ? 'not_found' : s === 409 ? 'conflict' : s === 422 || s === 400 ? 'validation' : s === 429 ? 'rate_limited' : s >= 500 ? 'server' : 'unknown';

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

/**
 * Client HTTP minimal : JSON, cookies de session httpOnly (credentials: include), erreurs normalisées.
 * Contrat attendu des erreurs : { code?: string; message?: string; fields?: Record<string,string> }.
 */
export async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(env.apiBaseUrl + path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, {
      method, credentials: 'include', signal: opts.signal,
      headers: { Accept: 'application/json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('network', 'network');
  }
  if (res.status === 401) unauthorizedListeners.forEach((l) => l());
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { message?: string; fields?: Record<string, string> };
    throw new ApiError(codeFromStatus(res.status), payload.message, { status: res.status, fields: payload.fields });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
