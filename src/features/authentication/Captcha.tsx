import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';

/**
 * Défi anti-robot ADAPTATIF (Cloudflare Turnstile). Il n'apparaît que lorsque le serveur l'exige (`captcha_required`), c'est-à-dire
 * après des signes d'abus ; sans clés configurées côté serveur, il n'apparaît jamais. Le jeton obtenu est vérifié par le SERVEUR :
 * l'interface ne décide de rien. Le script de Cloudflare n'est chargé qu'au moment où le défi est nécessaire.
 */
interface TurnstileApi {
  render(el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; 'expired-callback'?: () => void; language?: string }): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing')));
    script.onerror = () => {
      loading = null; // permet de réessayer
      reject(new Error('turnstile_blocked'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

type Status = 'loading' | 'ready' | 'unavailable';

/** Le widget : récupère la clé publique, charge Cloudflare, présente le défi, remet le jeton à `onToken` (et `undefined` quand il expire). */
export function CaptchaChallenge({ onToken, version }: { onToken: (token: string | undefined) => void; version: number }) {
  const t = useT('auth');
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    let alive = true;
    let widgetId: string | null = null;
    let api_: TurnstileApi | null = null;
    onToken(undefined);
    setStatus('loading');
    void (async () => {
      try {
        const caps = await api.auth.getCapabilities();
        if (!caps.captcha) throw new Error('captcha_off');
        api_ = await loadTurnstile();
        if (!alive || !host.current) return;
        widgetId = api_.render(host.current, {
          sitekey: caps.captcha.siteKey,
          callback: (token) => alive && onToken(token),
          'expired-callback': () => alive && onToken(undefined),
          'error-callback': () => alive && setStatus('unavailable'),
          language: document.documentElement.lang === 'en' ? 'en' : 'fr',
        });
        setStatus('ready');
      } catch {
        if (alive) setStatus('unavailable');
      }
    })();
    return () => {
      alive = false;
      if (widgetId && api_) api_.remove(widgetId);
    };
    // `version` : un jeton est à usage unique, chaque nouvel essai remonte le widget pour en obtenir un nouveau.
  }, [version, onToken]);

  return (
    <div className="captcha" data-testid="captcha" role="group" aria-label={t('auth.captcha.title')}>
      {status === 'loading' && <p className="muted">{t('auth.captcha.loading')}</p>}
      {status === 'unavailable' && <Alert tone="warning">{t('auth.captcha.unavailable')}</Alert>}
      <div ref={host} />
    </div>
  );
}

export type CaptchaKind = 'required' | 'failed' | 'unavailable';

export interface CaptchaControl {
  /** Le serveur a exigé un défi : le widget est affiché. */
  required: boolean;
  /** Jeton à joindre à la prochaine requête (`undefined` tant que le défi n'est pas réussi). */
  token: string | undefined;
  /** Le formulaire peut partir : aucun défi demandé, ou défi réussi. */
  ready: boolean;
  /** À afficher dans le formulaire (rien tant que le serveur n'a pas exigé de défi). */
  widget: ReactNode;
  /** Examine une erreur d'API : renvoie sa nature si elle concerne le défi (et prépare l'affichage), sinon `null`. */
  handle(error: unknown): CaptchaKind | null;
  /** Après toute tentative qui a consommé le jeton : en demande un nouveau. */
  refresh(): void;
  /** Texte à afficher pour une nature de défi. */
  message(kind: CaptchaKind): string;
}

export function useCaptcha(): CaptchaControl {
  const t = useT('auth');
  const [required, setRequired] = useState(false);
  const [token, setToken] = useState<string | undefined>();
  const [version, setVersion] = useState(0);
  const onToken = useCallback((value: string | undefined) => setToken(value), []);

  const handle = useCallback((error: unknown): CaptchaKind | null => {
    if (!isApiError(error)) return null;
    if (error.message === 'captcha_required' || error.message === 'captcha_failed') {
      setRequired(true);
      setToken(undefined);
      setVersion((v) => v + 1);
      return error.message === 'captcha_required' ? 'required' : 'failed';
    }
    if (error.message === 'captcha_unavailable') return 'unavailable';
    return null;
  }, []);

  const refresh = useCallback(() => {
    if (!required) return;
    setToken(undefined);
    setVersion((v) => v + 1);
  }, [required]);

  const message = useCallback((kind: CaptchaKind) => t(`auth.captcha.${kind}`), [t]);

  return {
    required, token, ready: !required || Boolean(token), refresh, handle, message,
    widget: required ? <CaptchaChallenge onToken={onToken} version={version} /> : null,
  };
}
