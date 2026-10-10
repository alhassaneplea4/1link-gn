import type { SocialPlatform } from '@/models/blocks';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** N'autorise que des protocoles sûrs : bloque `javascript:`, `data:`, etc. Retourne `undefined` si l'URL est refusée. */
export function safeHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw.trim());
    return ALLOWED_PROTOCOLS.has(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const digits = (phone: string) => phone.replace(/[^\d]/g, '');
export const telHref = (phone: string) => `tel:+${digits(phone)}`;
export const whatsappHref = (phone: string, message = '') =>
  `https://wa.me/${digits(phone)}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
export const mailHref = (email: string, subject = '') => `mailto:${email.trim()}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
export const mapsHref = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** Extrait un identifiant YouTube / Vimeo pour une intégration respectueuse de la vie privée. */
export function parseVideo(url: string): { provider: 'youtube' | 'vimeo'; id: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return { provider: 'youtube', id: u.pathname.slice(1) };
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop();
      return id ? { provider: 'youtube', id } : null;
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? { provider: 'vimeo', id } : null;
    }
  } catch {
    /* url invalide */
  }
  return null;
}

export const embedUrl = (v: { provider: 'youtube' | 'vimeo'; id: string }) =>
  v.provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0`
    : `https://player.vimeo.com/video/${encodeURIComponent(v.id)}?autoplay=1&dnt=1`;

export const platformIcon = (p: SocialPlatform | 'link') => (p === 'link' ? ('link' as const) : p === 'website' ? ('globe' as const) : p);

/** Image de remplacement générée localement (aucune requête réseau) : dégradé déterministe d'après une graine. */
export function placeholderImage(seed: string, w = 640, h = 480): string {
  let hash = 0;
  for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const h1 = hash % 360;
  const h2 = (h1 + 55) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${h1} 78% 58%)'/><stop offset='1' stop-color='hsl(${h2} 72% 42%)'/></linearGradient></defs><rect width='100%' height='100%' fill='url(%23g)'/><circle cx='${w * 0.78}' cy='${h * 0.28}' r='${h * 0.16}' fill='white' fill-opacity='.22'/><path d='M0 ${h} L${w * 0.35} ${h * 0.55} L${w * 0.6} ${h * 0.8} L${w * 0.8} ${h * 0.6} L${w} ${h * 0.85} V${h} Z' fill='white' fill-opacity='.18'/></svg>`;
  return `data:image/svg+xml;utf8,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}`;
}
