/**
 * Mots de passe à usage unique basés sur le temps (TOTP, RFC 6238) : compatibles Google Authenticator, Microsoft Authenticator,
 * Authy, 1Password… SHA-1, 6 chiffres, pas de 30 secondes. Aucune dépendance externe.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from './crypto.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret de 160 bits encodé en base32 (format attendu par les applications d'authentification). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secretBase32: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 1000 / TOTP_STEP_SEC);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest();
  const offset = h[h.length - 1]! & 15;
  const bin = ((h[offset]! & 127) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * Accepte le pas courant et un pas de part et d'autre (dérive d'horloge du téléphone) et renvoie le NUMÉRO de pas qui correspond
 * (ou `null`). Les trois pas sont toujours calculés : le temps de réponse ne dépend pas du pas trouvé.
 */
export function matchTotpStep(secretBase32: string, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now.getTime() / 1000 / TOTP_STEP_SEC);
  let found: number | null = null;
  for (const drift of [-1, 0, 1]) {
    if (safeEqual(totpAt(secretBase32, (current + drift) * TOTP_STEP_SEC * 1000), code)) found = current + drift;
  }
  return found;
}

export const verifyTotp = (secretBase32: string, code: string, now: Date): boolean => matchTotpStep(secretBase32, code, now) !== null;

export const otpauthUri = (secretBase32: string, account: string, issuer = '1Link') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
