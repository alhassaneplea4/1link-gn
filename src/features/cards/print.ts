/**
 * Fichiers destinés à l'imprimeur (Admin Center) — à ne pas confondre avec l'aperçu :
 *  - SVG vectoriel aux dimensions physiques (91,6 × 60 mm avec fond perdu de 3 mm, coupe 85,6 × 54 mm, marge de sécurité 4 mm) ;
 *  - PNG haute résolution (600 dpi ≈ 2 165 × 1 417 px), même cadrage.
 * Le QR code est celui de l'adresse définitive de la carte (`<domaine>/c/<code>`), en niveau de correction Q.
 */
import { CARD_BLEED, CARD_TRIM, PRINT_DPI, type CardDesign } from '@/models/cards';
import { cardSvg, type CardSide } from './render';

/** Matrice d'un QR code (vrai = module sombre). Correction d'erreur Q : robuste à l'usure d'une carte portée dans un portefeuille. */
export async function qrMatrix(value: string): Promise<boolean[][]> {
  const mod = (await import('qrcode-generator')) as { default: typeof import('qrcode-generator') };
  const qr = mod.default(0, 'Q');
  qr.addData(value);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => qr.isDark(r, c)));
}

/** Télécharge une image de la plateforme (ou https) et la renvoie sous forme `data:` pour l'intégrer au fichier d'impression. */
export async function toDataUri(url: string): Promise<string> {
  if (!url) return '';
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('image_unavailable');
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export interface PrintInput { design: CardDesign; url: string; nfc: boolean; side: CardSide }

export async function buildPrintSvg({ design, url, nfc, side }: PrintInput): Promise<string> {
  const imageHref = design.imageUrl ? await toDataUri(design.imageUrl) : '';
  const qr = side === 'back' ? await qrMatrix(url) : null;
  return cardSvg(design, side, { mode: 'print', qr, url, nfc, imageHref, idPrefix: 'pr' });
}

/** Dimensions en pixels d'un fichier d'impression (fond perdu inclus) à la résolution demandée. */
export const printPixels = (dpi = PRINT_DPI) => ({
  w: Math.round(((CARD_TRIM.w + 2 * CARD_BLEED) / 25.4) * dpi),
  h: Math.round(((CARD_TRIM.h + 2 * CARD_BLEED) / 25.4) * dpi),
});

export async function svgToPng(svg: string, dpi = PRINT_DPI): Promise<Blob> {
  const { w, h } = printPixels(dpi);
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('render_failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png_failed'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Nom de fichier lisible et sans caractère risqué : `CRT-7K2M9Q_recto.png`, `CRT-7K2M9Q_verso_k3m9….svg`. */
export const printFileName = (reference: string, side: CardSide, ext: 'svg' | 'png', code?: string) =>
  `${reference.replace(/[^A-Za-z0-9-]/g, '')}_${side === 'front' ? 'recto' : 'verso'}${code ? `_${code}` : ''}_${CARD_TRIM.w}x${CARD_TRIM.h}mm-fp${CARD_BLEED}.${ext}`;

export async function downloadPrintFile(input: PrintInput, reference: string, code: string | undefined, format: 'svg' | 'png') {
  const svg = await buildPrintSvg(input);
  const blob = format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await svgToPng(svg);
  downloadBlob(blob, printFileName(reference, input.side, format, input.side === 'back' ? code : undefined));
}
