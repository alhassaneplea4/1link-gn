/** Primitives cryptographiques (node:crypto uniquement, aucune dépendance native). */
import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

export const newId = (prefix: string) => `${prefix}_${randomBytes(10).toString('hex')}`;

/** Jeton opaque à entropie 256 bits (cookie de session, liens e-mail). Seul son hash est stocké. */
export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');

/** Jeton signé (HMAC-SHA256) à durée limitée : `base64url(JSON).signature`. Sans état : rien à stocker. */
export function signPayload(secret: string, payload: Record<string, unknown>, ttlMs: number, now: Date): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now.getTime() + ttlMs })).toString('base64url');
  return `${body}.${hmac(secret, `signed:${body}`)}`;
}

export function verifyPayload<T extends Record<string, unknown>>(secret: string, token: string, now: Date): (T & { exp: number }) | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !safeEqual(sig, hmac(secret, `signed:${body}`))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
    return typeof data.exp === 'number' && data.exp > now.getTime() ? data : null;
  } catch {
    return null;
  }
}

export const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

/** Code à 6 chiffres uniformément tiré (pas de biais modulo). */
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const KEY_LEN = 64;
const scrypt = (password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, KEY_LEN, { N: n, r, p, maxmem: 256 * n * r + (1 << 20) }, (err, key) => (err ? reject(err) : resolve(key)));
  });

/**
 * Hash de mot de passe : scrypt, sel unique de 16 octets. Format auto-descriptif
 * `scrypt$log2N$r$p$sel$hash` pour pouvoir augmenter le coût plus tard sans casser les anciens hash.
 */
export async function hashPassword(password: string, log2N: number): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 2 ** log2N, 8, 1);
  return `scrypt$${log2N}$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, log2N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !log2N || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), 2 ** Number(log2N), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Vrai si le hash doit être recalculé avec le coût courant. */
export const needsRehash = (stored: string, log2N: number) => Number(stored.split('$')[1]) < log2N;
