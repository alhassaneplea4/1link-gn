/**
 * Codes à usage unique de DÉMONSTRATION. Conservés en mémoire (jamais dans localStorage), avec les mêmes garde-fous
 * que ceux attendus d'un vrai fournisseur : expiration, nombre d'essais, délai de renvoi, plafond horaire.
 * Aucun message n'est envoyé : le code est renvoyé à l'interface, qui l'affiche explicitement comme un code de démonstration.
 */
export const OTP_TTL_SEC = 300;
export const OTP_RESEND_SEC = 30;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_PER_HOUR = 5;

interface Entry { code: string; expiresAt: number; attempts: number }

const entries = new Map<string, Entry>();
const requests = new Map<string, number[]>();

/** Code à 6 chiffres issu du générateur cryptographique du navigateur. */
export function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 1_000_000).padStart(6, '0');
}

export type OtpIssue = { ok: true; code: string } | { ok: false; reason: 'resend_too_soon' | 'too_many_requests'; retryAfterSec: number };

export function issueOtp(phone: string, now = Date.now()): OtpIssue {
  const recent = (requests.get(phone) ?? []).filter((t) => now - t < 3_600_000);
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < OTP_RESEND_SEC * 1000) {
    return { ok: false, reason: 'resend_too_soon', retryAfterSec: Math.ceil((OTP_RESEND_SEC * 1000 - (now - last)) / 1000) };
  }
  if (recent.length >= OTP_MAX_PER_HOUR) {
    return { ok: false, reason: 'too_many_requests', retryAfterSec: Math.ceil((3_600_000 - (now - recent[0]!)) / 1000) };
  }
  requests.set(phone, [...recent, now]);
  const code = generateCode();
  entries.set(phone, { code, expiresAt: now + OTP_TTL_SEC * 1000, attempts: 0 });
  return { ok: true, code };
}

export type OtpCheck = { ok: true } | { ok: false; reason: 'expired' | 'invalid_code' | 'too_many_attempts'; attemptsLeft?: number };

export function checkOtp(phone: string, code: string, now = Date.now()): OtpCheck {
  const e = entries.get(phone);
  if (!e || now >= e.expiresAt) {
    entries.delete(phone);
    return { ok: false, reason: 'expired' };
  }
  if (code !== e.code) {
    e.attempts += 1;
    if (e.attempts >= OTP_MAX_ATTEMPTS) {
      entries.delete(phone);
      return { ok: false, reason: 'too_many_attempts' };
    }
    return { ok: false, reason: 'invalid_code', attemptsLeft: OTP_MAX_ATTEMPTS - e.attempts };
  }
  entries.delete(phone); // usage unique
  return { ok: true };
}

/** Réinitialisation (tests). */
export function resetOtpState() {
  entries.clear();
  requests.clear();
}
