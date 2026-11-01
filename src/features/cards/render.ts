/**
 * Rendu SVG d'une carte 1Link (recto / verso). UNE seule fonction produit l'aperçu à l'écran ET le fichier d'impression,
 * mais les deux modes diffèrent volontairement :
 *  - `preview` : coins arrondis, léger reflet, rogné à 85,6 × 54 mm — ce que voit le client ;
 *  - `print`   : fond perdu de 3 mm de chaque côté (91,6 × 60 mm), angles droits, aucun effet, dimensions physiques en mm,
 *                image intégrée en base64 : le fichier est autonome pour l'imprimeur.
 * Tout texte saisi est échappé ; seules des images /api/media/… (ou https, ou données `data:image` générées par nos soins) sont acceptées.
 */
import { CARD_BLEED, CARD_SAFE, CARD_TEMPLATES, CARD_TRIM, type CardDesign, type CardTemplate } from '@/models/cards';

export type CardSide = 'front' | 'back';
export interface RenderOptions {
  mode: 'preview' | 'print';
  /** Matrice du QR code (vrai = module sombre) ; absente = pas de QR (recto seul). */
  qr?: boolean[][] | null;
  /** Adresse écrite dans le QR code et la puce : affichée au verso, sans le protocole. */
  url?: string;
  nfc?: boolean;
  /** Image prête à être intégrée (mode impression : `data:image/...;base64`). Sinon l'adresse du design est utilisée telle quelle. */
  imageHref?: string;
  /** Préfixe des identifiants internes (plusieurs aperçus sur la même page). */
  idPrefix?: string;
}

const W = CARD_TRIM.w;
const H = CARD_TRIM.h;
const S = CARD_SAFE;
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const INK = '#0b0f19';

export const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const n = (v: number) => Number(v.toFixed(3));

const SAFE_IMAGE = /^(?:\/api\/media\/med_[a-f0-9]{20}|https:\/\/[^\s"'<>\\]+|data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)$/;

/** Luminance relative (WCAG) d'une couleur #rrggbb, pour choisir un texte lisible sur un fond. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const v = [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}
const onColor = (bg: string) => (luminance(bg) > 0.45 ? INK : '#ffffff');

/** Taille de police qui tient dans `maxW` (mm) : on réduit jusqu'à 62 %, puis on tronque. Largeur moyenne d'un caractère ≈ 0,56 em. */
export function fitText(text: string, size: number, maxW: number): { text: string; size: number } {
  const width = (t: string, s: number) => t.length * s * 0.56;
  let s = size;
  while (width(text, s) > maxW && s > size * 0.62) s -= size * 0.04;
  if (width(text, s) <= maxW) return { text, size: n(s) };
  const max = Math.max(1, Math.floor(maxW / (s * 0.56)) - 1);
  return { text: `${text.slice(0, max).trimEnd()}…`, size: n(s) };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase().slice(0, 2);
}

/** Les modules sombres d'un QR code en un seul tracé (une exécution horizontale par segment) : léger et net à toute taille. */
export function qrPath(matrix: boolean[][], x: number, y: number, module: number): string {
  const out: string[] = [];
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c++; continue; }
      let end = c;
      while (end < row.length && row[end]) end++;
      out.push(`M${n(x + c * module)} ${n(y + r * module)}h${n((end - c) * module)}v${n(module)}h${n(-(end - c) * module)}z`);
      c = end;
    }
  });
  return out.join('');
}

function background(t: CardTemplate, id: string, x: number, y: number, w: number, h: number): { defs: string; rect: string } {
  const bg = t.background;
  if (bg.type === 'solid') return { defs: '', rect: `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg.color}"/>` };
  const a = (bg.angle * Math.PI) / 180;
  const dx = Math.sin(a) / 2;
  const dy = -Math.cos(a) / 2;
  return {
    defs: `<linearGradient id="${id}-bg" x1="${n(0.5 - dx)}" y1="${n(0.5 - dy)}" x2="${n(0.5 + dx)}" y2="${n(0.5 + dy)}"><stop offset="0" stop-color="${bg.from}"/><stop offset="1" stop-color="${bg.to}"/></linearGradient>`,
    rect: `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}-bg)"/>`,
  };
}

/** Marque 1Link (même symbole que le logo de l'application) dans un carré de `s` mm. */
function mark(x: number, y: number, s: number, id: string): string {
  const k = s / 48;
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(k)})"><defs><linearGradient id="${id}-m" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop stop-color="#2563EB"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs><rect x="0.6" y="0.6" width="46.8" height="46.8" rx="13.4" fill="url(#${id}-m)" stroke="#fff" stroke-opacity="0.7" stroke-width="1.2"/><path d="M14.5 17.5 22 11.5V34h8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36" cy="34" r="3.1" fill="none" stroke="#fff" stroke-width="2.6"/></g>`;
}

function text(x: number, y: number, t: string, size: number, fill: string, o: { weight?: number; anchor?: 'start' | 'middle' | 'end'; maxW?: number; spacing?: number } = {}): string {
  if (!t) return '';
  const f = o.maxW ? fitText(t, size, o.maxW) : { text: t, size };
  return `<text x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${f.size}" font-weight="${o.weight ?? 400}" fill="${fill}" text-anchor="${o.anchor ?? 'start'}"${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${esc(f.text)}</text>`;
}

function portrait(d: CardDesign, id: string, cx: number, cy: number, r: number, href: string, fallbackFill: string, initialsFill?: string): string {
  const ring = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + 0.5)}" fill="${d.accent}" opacity="0.9"/>`;
  if (href) {
    if (d.imageKind === 'logo') {
      const s = r * 2;
      return `${ring}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="#ffffff"/><clipPath id="${id}-img"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath><image href="${esc(href)}" x="${n(cx - r * 0.78)}" y="${n(cy - r * 0.78)}" width="${n(s * 0.78)}" height="${n(s * 0.78)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${id}-img)"/>`;
    }
    return `${ring}<clipPath id="${id}-img"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/></clipPath><image href="${esc(href)}" x="${n(cx - r)}" y="${n(cy - r)}" width="${n(r * 2)}" height="${n(r * 2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}-img)"/>`;
  }
  return `${ring}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fallbackFill}"/>${text(cx, cy + r * 0.36, initials(d.name) || '1L', r * 0.95, initialsFill ?? onColor(fallbackFill), { weight: 700, anchor: 'middle' })}`;
}

function front(d: CardDesign, t: CardTemplate, id: string, href: string, bleed: number): string {
  const muted = t.muted;
  const parts: string[] = [];
  const accentText = luminance(d.accent) > 0.8 && luminance(t.background.type === 'solid' ? t.background.color : t.background.from) > 0.6 ? INK : d.accent;
  if (t.layout === 'left') {
    parts.push(portrait(d, id, S + 8.5, S + 8.5, 8.5, href, d.accent));
    parts.push(mark(W - S - 6, S, 6, id));
    parts.push(`<rect x="${S}" y="28.6" width="10" height="1.1" rx="0.55" fill="${d.accent}"/>`);
    parts.push(text(S, 36, d.name, 5.4, t.text, { weight: 700, maxW: W - 2 * S }));
    parts.push(text(S, 41.2, d.title, 3.3, muted, { maxW: W - 2 * S }));
    parts.push(text(S, 45.6, d.organization, 3.1, accentText, { weight: 700, maxW: W - 2 * S }));
    parts.push(text(S, H - S + 0.4, d.contact, 2.7, muted, { maxW: W - 2 * S }));
  } else if (t.layout === 'center') {
    parts.push(portrait(d, id, W / 2, S + 9, 8, href, d.accent));
    parts.push(text(W / 2, 31.4, d.name, 5.2, t.text, { weight: 700, anchor: 'middle', maxW: W - 2 * S }));
    parts.push(text(W / 2, 36.6, d.title, 3.2, muted, { anchor: 'middle', maxW: W - 2 * S }));
    parts.push(text(W / 2, 41.2, d.organization, 3.0, d.accent, { weight: 700, anchor: 'middle', maxW: W - 2 * S }));
    parts.push(text(W / 2, H - S + 0.4, d.contact, 2.6, muted, { anchor: 'middle', maxW: W - 2 * S }));
  } else {
    const bandW = 24;
    parts.push(`<rect x="${-bleed}" y="${-bleed}" width="${bandW + bleed}" height="${H + 2 * bleed}" fill="${d.accent}"/>`);
    parts.push(portrait({ ...d, accent: onColor(d.accent) }, id, bandW / 2, H / 2, 8, href, '#ffffff', luminance(d.accent) > 0.7 ? INK : d.accent));
    parts.push(mark(W - S - 6, S, 6, id));
    const x = bandW + 6;
    const maxW = W - S - x;
    parts.push(text(x, 24, d.name, 4.8, t.text, { weight: 700, maxW }));
    parts.push(text(x, 29.4, d.title, 3.1, muted, { maxW }));
    parts.push(text(x, 34.4, d.organization, 3.0, luminance(d.accent) > 0.7 ? INK : d.accent, { weight: 700, maxW }));
    parts.push(text(x, H - S + 0.4, d.contact, 2.6, muted, { maxW }));
  }
  return parts.join('');
}

function back(d: CardDesign, t: CardTemplate, id: string, o: RenderOptions): string {
  const parts: string[] = [];
  const tile = 34;
  const tx = S + 1;
  const ty = (H - tile) / 2;
  parts.push(`<rect x="${tx}" y="${ty}" width="${tile}" height="${tile}" rx="${o.mode === 'preview' ? 2.4 : 0}" fill="${t.qrTile}"/>`);
  if (o.qr?.length) {
    const quiet = 3;
    const module = tile / (o.qr.length + quiet * 2);
    parts.push(`<path d="${qrPath(o.qr, tx + quiet * module, ty + quiet * module, module)}" fill="${INK}"/>`);
  }
  const x = tx + tile + 7;
  const maxW = W - S - x;
  parts.push(mark(x, 11, 9, id));
  parts.push(text(x + 11.5, 18, '1Link', 6, t.text, { weight: 700 }));
  const shown = (o.url ?? '').replace(/^https?:\/\//, '');
  parts.push(text(x, 27.6, shown, 2.7, t.muted, { maxW }));
  parts.push(text(x, 32.4, d.name, 3.2, t.text, { weight: 700, maxW }));
  if (o.nfc) {
    const y = 42;
    const c = luminance(d.accent) > 0.85 && luminance(t.background.type === 'solid' ? t.background.color : t.background.from) > 0.6 ? INK : d.accent;
    parts.push(`<g fill="none" stroke="${c}" stroke-width="0.75" stroke-linecap="round"><path d="M${x + 1} ${y - 3}a5 5 0 0 1 0 6"/><path d="M${x + 3.4} ${y - 4.8}a8 8 0 0 1 0 9.6"/><path d="M${x + 5.8} ${y - 6.6}a11 11 0 0 1 0 13.2"/></g>`);
    parts.push(text(x + 10, y + 1.2, 'NFC', 3.4, c, { weight: 700, spacing: 0.4 }));
  }
  return parts.join('');
}

export function cardSvg(design: CardDesign, side: CardSide, opts: RenderOptions): string {
  const t = CARD_TEMPLATES[design.templateId];
  const id = opts.idPrefix ?? 'cd';
  const print = opts.mode === 'print';
  const bleed = print ? CARD_BLEED : 0;
  const href = (() => {
    const v = (opts.imageHref ?? design.imageUrl ?? '').trim();
    return v && SAFE_IMAGE.test(v) ? v : '';
  })();
  const bg = background(t, id, -bleed, -bleed, W + 2 * bleed, H + 2 * bleed);
  const body = side === 'front' ? front(design, t, id, href, bleed) : back(design, t, id, opts);

  const head = print
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W + 2 * bleed)}mm" height="${n(H + 2 * bleed)}mm" viewBox="${-bleed} ${-bleed} ${n(W + 2 * bleed)} ${n(H + 2 * bleed)}"><title>1Link Cards · ${side === 'front' ? 'recto' : 'verso'} · coupe ${W}×${H} mm · fond perdu ${CARD_BLEED} mm · marge ${CARD_SAFE} mm</title>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">`;
  const defs = `<defs>${bg.defs}${print ? '' : `<clipPath id="${id}-clip"><rect width="${W}" height="${H}" rx="3.2"/></clipPath><linearGradient id="${id}-gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/></linearGradient>`}</defs>`;
  const inner = `${bg.rect}${body}`;
  return print
    ? `${head}${defs}${inner}</svg>`
    : `${head}${defs}<g clip-path="url(#${id}-clip)">${inner}<rect width="${W}" height="${H}" fill="url(#${id}-gloss)"/></g></svg>`;
}
