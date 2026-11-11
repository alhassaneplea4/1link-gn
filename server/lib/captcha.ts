/**
 * Défi anti-robot Cloudflare Turnstile (vérification côté SERVEUR du jeton produit par le widget du navigateur).
 * Sans clés configurées, la fonctionnalité est simplement absente : aucun faux défi n'est jamais présenté.
 * Un jeton est à usage unique et valable 5 minutes ; Cloudflare le refuse s'il est rejoué.
 */
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** `ok` : jeton valide ; `failed` : jeton refusé ; `unavailable` : le service ne répond pas (on ne peut ni accepter ni refuser sur le fond). */
export type CaptchaOutcome = 'ok' | 'failed' | 'unavailable';

export async function verifyTurnstile(secret: string, token: string, ip: string | null, opts: { timeoutMs?: number } = {}): Promise<CaptchaOutcome> {
  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'local') form.set('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(opts.timeoutMs ?? 4_000) });
    if (!res.ok) return 'unavailable';
    const body = (await res.json()) as { success?: boolean };
    return body.success === true ? 'ok' : 'failed';
  } catch {
    return 'unavailable';
  }
}
