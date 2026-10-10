import { env } from '@/app/configuration/env';
import { ApiError } from '@/models/api';

const MAX_SIDE = 1000;
const MAX_BYTES = 12 * 1024 * 1024;

/** Réduit l'image avant l'envoi (bande passante limitée : l'envoi d'une photo de 6 Mo est inutile pour une page mobile). */
async function downscale(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (ratio === 1 && file.size < 400_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Envoi d'une image vers le serveur (stockée dans la base de données). Retourne l'adresse définitive `/api/media/<id>`.
 * Contrat : POST /me/media (multipart, champ `file`) → { url }.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ApiError('validation', 'not_an_image');
  if (file.size > MAX_BYTES) throw new ApiError('validation', 'file_too_large');
  const body = new FormData();
  body.append('file', await downscale(file), file.name.replace(/\.[^.]+$/, '') + '.jpg');
  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}/me/media`, { method: 'POST', body, credentials: 'include' });
  } catch {
    throw new ApiError('network', 'network');
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status === 413 ? 'validation' : res.status === 429 ? 'rate_limited' : 'server', payload.message ?? 'upload_failed', { status: res.status });
  }
  return ((await res.json()) as { url: string }).url;
}
