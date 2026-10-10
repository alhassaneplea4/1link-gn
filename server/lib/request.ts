import type { ZodType } from 'zod';
import type { C } from '../context.js';
import { HttpError } from './errors.js';

const MAX_JSON_BYTES = 512 * 1024;

/** Adresse du client. Derrière Vercel, `x-vercel-forwarded-for` / `x-real-ip` sont posés par la plateforme (non falsifiables). */
export function clientIp(c: C): string {
  const h = (n: string) => c.req.header(n)?.trim();
  const ip = h('x-vercel-forwarded-for') ?? h('x-real-ip') ?? h('x-forwarded-for')?.split(',')[0]?.trim();
  return ip && ip.length <= 64 ? ip : 'local';
}

export function fieldsFromZod(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues.slice(0, 20)) {
    const key = issue.path.length ? String(issue.path[0]) : '_';
    fields[key] ??= issue.message.slice(0, 80);
  }
  return fields;
}

/** Lit un corps JSON borné puis le valide : une entrée invalide renvoie une 422 `{ message, fields }`, jamais une 500. */
export async function readJson<T>(c: C, schema: ZodType<T>, maxBytes = MAX_JSON_BYTES): Promise<T> {
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large');
  const text = await c.req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, 'payload_too_large');
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, 'invalid', fieldsFromZod(parsed.error.issues));
  return parsed.data;
}

/** Entier borné issu d'un paramètre d'URL. */
export const intParam = (v: string | undefined, def: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
