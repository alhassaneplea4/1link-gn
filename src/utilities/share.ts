/**
 * Partage : QR code en image PNG et feuille de partage du système (toutes les applications installées).
 *  - dans l'application Android (Capacitor) : plugin natif « OneLinkShare » (le lien ET l'image du QR code) ;
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

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath?.();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill?.();
    return;
  }
  if (typeof ctx.beginPath === 'function') {
    ctx.beginPath();
    ctx.moveTo?.(x + r, y);
    ctx.arcTo?.(x + w, y, x + w, y + h, r);
    ctx.arcTo?.(x + w, y + h, x, y + h, r);
    ctx.arcTo?.(x, y + h, x, y, r);
    ctx.arcTo?.(x, y, x + w, y, r);
    ctx.closePath?.();
    ctx.fill?.();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

/** QR code → image PNG avec logo 1Link au centre (zone blanche de 4 modules autour, requise pour une lecture fiable). */
export async function qrPngBlob(value: string, size = 768): Promise<Blob | null> {
  try {
    const mod = (await import('qrcode-generator')) as { default: typeof import('qrcode-generator') };
    // 'H' (High) pour une correction d'erreur de 30%, permettant l'inclusion du logo central.
    const qr = mod.default(0, 'H');
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
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }

    // Logo 1Link au centre
    const logoModules = Math.max(6, Math.round(n * 0.24));
    const logoPx = logoModules * cell;
    const logoX = (px - logoPx) / 2;
    const logoY = (px - logoPx) / 2;
    const pad = Math.max(2, Math.round(cell * 0.45));

    // 1. Fond blanc de sécurité
    ctx.fillStyle = '#ffffff';
    fillRoundRect(ctx, logoX - pad, logoY - pad, logoPx + pad * 2, logoPx + pad * 2, Math.max(4, Math.round((logoPx + pad * 2) * 0.24)));

    // 2. Badge dégradé 1Link
    if (typeof ctx.createLinearGradient === 'function') {
      const grad = ctx.createLinearGradient(logoX, logoY, logoX + logoPx, logoY + logoPx);
      grad.addColorStop(0, '#2563EB');
      grad.addColorStop(1, '#7C3AED');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#2563EB';
    }
    fillRoundRect(ctx, logoX, logoY, logoPx, logoPx, Math.max(3, Math.round(logoPx * (14 / 48))));

    // 3. Glyphe "1L" et cercle
    if (typeof ctx.save === 'function' && typeof ctx.scale === 'function' && typeof ctx.beginPath === 'function') {
      ctx.save();
      ctx.translate(logoX, logoY);
      const s = logoPx / 48;
      ctx.scale(s, s);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(14.5, 17.5);
      ctx.lineTo(22, 11.5);
      ctx.lineTo(22, 34);
      ctx.lineTo(30, 34);
      ctx.stroke?.();

      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(36, 34, 3.1, 0, Math.PI * 2);
      ctx.stroke?.();
      ctx.restore();
    }

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch {
    return null;
  }
}

const isCancel = (e: unknown) => /cancel|abort|dismiss/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`);

/** Ouvre la feuille de partage du système. `unavailable` : rien n'a été ouvert (ordinateur, navigateur sans Web Share). */
export async function systemShare(p: SharePayload): Promise<ShareOutcome> {
  const cap = capacitor();
  const native = cap?.Plugins?.OneLinkShare?.share;
  if (cap?.isNativePlatform?.() && native) {
    try {
      await native({ title: p.title, text: p.text ?? '', url: p.url, ...(p.qr ? { image: await toBase64(p.qr) } : {}) });
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
