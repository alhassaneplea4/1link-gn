/**
 * Partage : QR code en image PNG et feuille de partage du système (toutes les applications installées).
 *  - dans l'application Android (Capacitor) : plugins natifs « Share » + « Filesystem » (le lien ET l'image du QR code) ;
 *  - dans un navigateur : API Web Share quand elle existe (avec l'image si le navigateur sait partager des fichiers) ;
 *  - sinon : `unavailable`, l'appelant affiche alors sa boîte de dialogue (copier, WhatsApp, télécharger le QR…).
 */

export interface SharePayload {
  title: string;
  text?: string;
  url: string;
  /** Image PNG du QR code à joindre. */
  qr?: Blob | null;
}
export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable';

interface CapacitorLike {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, Record<string, (arg?: unknown) => Promise<unknown>> | undefined>;
}
const capacitor = () => (globalThis as { Capacitor?: CapacitorLike }).Capacitor;

/** Vrai dans l'application Android 1Link (pont natif Capacitor injecté dans la page). */
export const isNativeApp = (): boolean => capacitor()?.isNativePlatform?.() === true;

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** QR code → image PNG (zone blanche de 4 modules autour, requise pour une lecture fiable). */
export async function qrPngBlob(value: string, size = 768): Promise<Blob | null> {
  try {
    const mod = (await import('qrcode-generator')) as { default: typeof import('qrcode-generator') };
    const qr = mod.default(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    const cell = Math.max(2, Math.floor(size / (n + quiet * 2)));
    const px = cell * (n + quiet * 2);
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#111827';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}

const isCancel = (e: unknown) => /cancel|abort|dismiss/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`);

/** Ouvre la feuille de partage du système. `unavailable` : rien n'a été ouvert (ordinateur, navigateur sans Web Share). */
export async function systemShare(p: SharePayload): Promise<ShareOutcome> {
  const cap = capacitor();
  if (cap?.isNativePlatform?.() && cap.Plugins?.Share?.share) {
    try {
      const files: string[] = [];
      const write = cap.Plugins.Filesystem?.writeFile;
      if (p.qr && write) {
        const res = (await write({ path: 'onelink-qr.png', data: await toBase64(p.qr), directory: 'CACHE' })) as { uri?: string };
        if (res?.uri) files.push(res.uri);
      }
      await cap.Plugins.Share.share({ title: p.title, text: p.text, url: p.url, ...(files.length ? { files } : {}), dialogTitle: p.title });
      return 'shared';
    } catch (e) {
      return isCancel(e) ? 'cancelled' : 'unavailable';
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const data: ShareData = { title: p.title, text: p.text, url: p.url };
    if (p.qr && typeof navigator.canShare === 'function') {
      const file = new File([p.qr], 'onelink-qr.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) data.files = [file];
    }
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      return isCancel(e) ? 'cancelled' : 'unavailable';
    }
  }
  return 'unavailable';
}

/** Télécharge un fichier généré dans le navigateur (non utilisé dans l'application Android : on y partage l'image). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
