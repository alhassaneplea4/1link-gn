import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { api } from '@/services/api';
import { isApiError } from '@/models/api';
import type { IdentityProof, PasskeyInfo, Session } from '@/models/auth';
import type { useT } from '@/i18n/core';
import { explainOtpError } from './otpErrors';

type T = ReturnType<typeof useT>;

/** Cet appareil et ce navigateur savent-ils gérer des clés d'accès ? (Sinon, aucun bouton n'est proposé.) */
export function passkeysSupported(): boolean {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

/**
 * Connexion par clé d'accès : le serveur donne un défi à usage unique, l'appareil le signe (après avoir vérifié l'utilisateur :
 * empreinte, visage ou code), le serveur vérifie la signature et ouvre la session. Aucune adresse, aucun mot de passe, aucun code.
 */
export async function signInWithPasskey(): Promise<Session> {
  const { handle, options } = await api.auth.startPasskeyLogin();
  const response = await startAuthentication({ optionsJSON: options });
  return api.auth.finishPasskeyLogin({ handle, response });
}

/** Enrôlement : preuve d'identité du titulaire (envoyée au serveur), puis signature du défi par l'appareil. */
export async function registerPasskey(proof: IdentityProof, name: string): Promise<{ passkey: PasskeyInfo; session: Session }> {
  const { handle, options } = await api.auth.startPasskeyRegistration(proof);
  const response = await startRegistration({ optionsJSON: options });
  return api.auth.finishPasskeyRegistration({ handle, response, name });
}

/** L'utilisateur a refusé, ou la fenêtre de l'appareil a expiré : ce n'est pas une panne. */
export const isPasskeyCancelled = (e: unknown): boolean => e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');

/** Traduit une erreur de connexion par clé d'accès, sans rien révéler de plus que le serveur. */
export function explainPasskeyLoginError(t: T, e: unknown): string {
  if (isPasskeyCancelled(e)) return t('auth.passkey.cancelled');
  if (isApiError(e)) {
    if (e.code === 'network') return t('auth.errors.network');
    if (e.message === 'invalid_passkey') return t('auth.passkey.unknown');
    if (e.message === 'invalid_challenge') return t('auth.passkey.expired');
    if (e.message === 'account_suspended') return t('auth.passkey.suspended');
    if (e.message === 'rate_limited' || e.message === 'too_many_requests') return t('auth.phone.errors.tooManyRequests', { min: Math.ceil(Number(e.fields?.retryAfterSec ?? 60) / 60) });
  }
  return t('auth.passkey.failed');
}

/** Traduit une erreur d'enrôlement. */
export function explainPasskeyRegisterError(t: T, e: unknown): string {
  if (isPasskeyCancelled(e)) return t('dashboard.security.passkeys.cancelled');
  if (e instanceof Error && e.name === 'InvalidStateError') return t('dashboard.security.passkeys.exists'); // cet appareil a déjà une clé pour ce compte
  if (isApiError(e)) {
    if (e.message === 'passkey_limit') return t('dashboard.security.passkeys.limit');
    if (e.message === 'passkey_exists') return t('dashboard.security.passkeys.exists');
    if (e.message === 'passkey_challenge_expired') return t('dashboard.security.passkeys.expired');
    if (e.message === 'passkey_invalid') return t('dashboard.security.passkeys.failed');
    return explainOtpError(t, e); // preuve d'identité refusée (mot de passe, code), plafonds de débit, réseau…
  }
  return t('dashboard.security.passkeys.failed');
}
