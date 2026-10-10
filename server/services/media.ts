/** Images téléversées : stockées dans PostgreSQL (petites, réduites côté client), servies avec un cache immuable. */
import { and, eq, sql } from 'drizzle-orm';
import type { Deps } from '../context.js';
import { media } from '../db/schema.js';
import { newId, sha256 } from '../lib/crypto.js';
import { badRequest, HttpError } from '../lib/errors.js';

export const MAX_IMAGE_BYTES = 1_500_000;
export const USER_QUOTA_BYTES = 40_000_000;

/** Type réel déduit des premiers octets : l'en-tête déclaré par le client n'est jamais cru. SVG volontairement exclu (scripts). */
export function sniffImage(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length > 12 && /^GIF8[79]a/.test(buf.subarray(0, 6).toString('latin1'))) return 'image/gif';
  return null;
}

export async function storeImage(deps: Deps, userId: string, bytes: Buffer): Promise<{ id: string; url: string }> {
  if (bytes.length === 0) throw badRequest('empty_file');
  if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'file_too_large');
  const mime = sniffImage(bytes);
  if (!mime) throw new HttpError(415, 'not_an_image');
  const hash = sha256(bytes.toString('base64'));
  const [dup] = await deps.db.select({ id: media.id }).from(media).where(and(eq(media.userId, userId), eq(media.sha256, hash))).limit(1);
  if (dup) return { id: dup.id, url: `/api/media/${dup.id}` };
  const [used] = await deps.db.select({ total: sql<number>`coalesce(sum(${media.size}), 0)::int` }).from(media).where(eq(media.userId, userId));
  if ((used?.total ?? 0) + bytes.length > USER_QUOTA_BYTES) throw new HttpError(413, 'quota_exceeded');
  const id = `med_${newId('x').slice(2)}`;
  await deps.db.insert(media).values({ id, userId, mime, size: bytes.length, sha256: hash, data: bytes, createdAt: deps.now() });
  return { id, url: `/api/media/${id}` };
}

export async function readImage(deps: Deps, id: string) {
  const [row] = await deps.db.select({ mime: media.mime, data: media.data }).from(media).where(eq(media.id, id)).limit(1);
  return row ?? null;
}
