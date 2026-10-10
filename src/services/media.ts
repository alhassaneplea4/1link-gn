import { env } from '@/app/configuration/env';
import { ApiError } from '@/models/api';

const MAX_SIDE = 800;
const MAX_BYTES = 8 * 1024 * 1024;

async function downscaleToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Envoi d'une image. Mode démonstration : l'image est réduite puis conservée sous forme d'URL de données dans ce navigateur
 * (aucun envoi). Mode HTTP : envoi vers l'API qui retourne l'URL définitive (contrat : POST /me/media → { url }).
 */
export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ApiError('validation', 'not_an_image');
  if (file.size > MAX_BYTES) throw new ApiError('validation', 'file_too_large');
  if (env.apiMode === 'demo') return downscaleToDataUrl(file);
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${env.apiBaseUrl}/me/media`, { method: 'POST', body, credentials: 'include' });
  if (!res.ok) throw new ApiError('server', 'upload_failed', { status: res.status });
  return ((await res.json()) as { url: string }).url;
}
