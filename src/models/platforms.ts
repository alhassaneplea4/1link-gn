/**
 * Catalogue des plateformes sociales proposées dans les blocs « Réseaux » et « Lien ».
 * `base` = adresse officielle à laquelle l'utilisateur n'a plus qu'à ajouter son nom d'utilisateur.
 * Ajouter une plateforme = une ligne ici + son logo dans `components/ui/brandIcons.ts` (+ son nom d'affichage ci-dessous).
 */

export interface PlatformDef {
  id: string;
  name: string;
  /** Début de l'adresse officielle (le nom d'utilisateur se saisit à la suite). */
  base: string;
  /** Autres noms/mots-clés reconnus par la recherche. */
  aliases?: readonly string[];
  /** Domaines reconnus pour détecter la plateforme depuis un lien collé. */
  hosts: readonly string[];
}

export const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', base: 'https://instagram.com/', aliases: ['insta', 'ig'], hosts: ['instagram.com'] },
  { id: 'facebook', name: 'Facebook', base: 'https://facebook.com/', aliases: ['fb'], hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  { id: 'tiktok', name: 'TikTok', base: 'https://tiktok.com/@', aliases: ['tik tok'], hosts: ['tiktok.com'] },
  { id: 'youtube', name: 'YouTube', base: 'https://youtube.com/@', aliases: ['yt', 'you tube'], hosts: ['youtube.com', 'youtu.be'] },
  { id: 'whatsapp', name: 'WhatsApp', base: 'https://wa.me/', aliases: ['wa', 'whats app'], hosts: ['wa.me', 'whatsapp.com'] },
  { id: 'telegram', name: 'Telegram', base: 'https://t.me/', aliases: ['tg'], hosts: ['t.me', 'telegram.me', 'telegram.org'] },
  { id: 'x', name: 'X (Twitter)', base: 'https://x.com/', aliases: ['twitter', 'tweet'], hosts: ['x.com', 'twitter.com'] },
  { id: 'linkedin', name: 'LinkedIn', base: 'https://linkedin.com/in/', aliases: ['linked in'], hosts: ['linkedin.com'] },
  { id: 'snapchat', name: 'Snapchat', base: 'https://snapchat.com/add/', aliases: ['snap'], hosts: ['snapchat.com'] },
  { id: 'threads', name: 'Threads', base: 'https://threads.net/@', hosts: ['threads.net', 'threads.com'] },
  { id: 'discord', name: 'Discord', base: 'https://discord.gg/', hosts: ['discord.gg', 'discord.com'] },
  { id: 'twitch', name: 'Twitch', base: 'https://twitch.tv/', hosts: ['twitch.tv'] },
  { id: 'pinterest', name: 'Pinterest', base: 'https://pinterest.com/', aliases: ['pin'], hosts: ['pinterest.com', 'pin.it'] },
  { id: 'reddit', name: 'Reddit', base: 'https://reddit.com/user/', hosts: ['reddit.com'] },
  { id: 'messenger', name: 'Messenger', base: 'https://m.me/', hosts: ['m.me', 'messenger.com'] },
  { id: 'signal', name: 'Signal', base: 'https://signal.me/#eu/', hosts: ['signal.me', 'signal.org'] },
  { id: 'line', name: 'LINE', base: 'https://line.me/ti/p/', hosts: ['line.me'] },
  { id: 'spotify', name: 'Spotify', base: 'https://open.spotify.com/user/', aliases: ['musique', 'music', 'podcast'], hosts: ['open.spotify.com', 'spotify.com'] },
  { id: 'applemusic', name: 'Apple Music', base: 'https://music.apple.com/', aliases: ['itunes', 'musique', 'music'], hosts: ['music.apple.com', 'itunes.apple.com'] },
  { id: 'soundcloud', name: 'SoundCloud', base: 'https://soundcloud.com/', aliases: ['musique', 'music'], hosts: ['soundcloud.com'] },
  { id: 'deezer', name: 'Deezer', base: 'https://deezer.com/profile/', aliases: ['musique', 'music'], hosts: ['deezer.com'] },
  { id: 'audiomack', name: 'Audiomack', base: 'https://audiomack.com/', aliases: ['musique', 'music'], hosts: ['audiomack.com'] },
  { id: 'boomplay', name: 'Boomplay', base: 'https://boomplay.com/', aliases: ['musique', 'music'], hosts: ['boomplay.com'] },
  { id: 'vimeo', name: 'Vimeo', base: 'https://vimeo.com/', aliases: ['video', 'vidéo'], hosts: ['vimeo.com'] },
  { id: 'kick', name: 'Kick', base: 'https://kick.com/', aliases: ['stream', 'live'], hosts: ['kick.com'] },
  { id: 'github', name: 'GitHub', base: 'https://github.com/', aliases: ['code', 'dev'], hosts: ['github.com'] },
  { id: 'gitlab', name: 'GitLab', base: 'https://gitlab.com/', aliases: ['code', 'dev'], hosts: ['gitlab.com'] },
  { id: 'stackoverflow', name: 'Stack Overflow', base: 'https://stackoverflow.com/users/', aliases: ['dev'], hosts: ['stackoverflow.com'] },
  { id: 'behance', name: 'Behance', base: 'https://behance.net/', aliases: ['design', 'portfolio'], hosts: ['behance.net'] },
  { id: 'dribbble', name: 'Dribbble', base: 'https://dribbble.com/', aliases: ['design', 'portfolio'], hosts: ['dribbble.com'] },
  { id: 'medium', name: 'Medium', base: 'https://medium.com/@', aliases: ['blog', 'article'], hosts: ['medium.com'] },
  { id: 'tumblr', name: 'Tumblr', base: 'https://tumblr.com/', aliases: ['blog'], hosts: ['tumblr.com'] },
  { id: 'flickr', name: 'Flickr', base: 'https://flickr.com/people/', aliases: ['photo'], hosts: ['flickr.com'] },
  { id: 'patreon', name: 'Patreon', base: 'https://patreon.com/', aliases: ['soutien', 'support'], hosts: ['patreon.com'] },
  { id: 'kofi', name: 'Ko-fi', base: 'https://ko-fi.com/', aliases: ['kofi', 'soutien', 'support', 'don'], hosts: ['ko-fi.com'] },
  { id: 'buymeacoffee', name: 'Buy Me a Coffee', base: 'https://buymeacoffee.com/', aliases: ['café', 'cafe', 'soutien', 'support', 'don'], hosts: ['buymeacoffee.com'] },
  { id: 'calendly', name: 'Calendly', base: 'https://calendly.com/', aliases: ['rendez-vous', 'rdv', 'agenda'], hosts: ['calendly.com'] },
  { id: 'googleplay', name: 'Google Play', base: 'https://play.google.com/store/apps/details?id=', aliases: ['android', 'application', 'app'], hosts: ['play.google.com'] },
  { id: 'appstore', name: 'App Store', base: 'https://apps.apple.com/app/', aliases: ['iphone', 'ios', 'application', 'app'], hosts: ['apps.apple.com'] },
  { id: 'mastodon', name: 'Mastodon', base: 'https://mastodon.social/@', hosts: ['mastodon.social'] },
  { id: 'bluesky', name: 'Bluesky', base: 'https://bsky.app/profile/', hosts: ['bsky.app'] },
  { id: 'vk', name: 'VK', base: 'https://vk.com/', aliases: ['vkontakte'], hosts: ['vk.com'] },
  { id: 'quora', name: 'Quora', base: 'https://quora.com/profile/', hosts: ['quora.com'] },
  { id: 'website', name: 'Site web', base: 'https://', aliases: ['site', 'web', 'blog', 'portfolio', 'boutique'], hosts: [] },
] as const satisfies readonly PlatformDef[];


const BY_ID: ReadonlyMap<string, PlatformDef> = new Map(PLATFORMS.map((p) => [p.id, p]));
export const platformById = (id: string): PlatformDef | undefined => BY_ID.get(id);

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Recherche tolérante (accents, casse, alias) : le nom commence par la saisie d'abord, puis la contient, puis les alias. */
export function searchPlatforms(query: string): PlatformDef[] {
  const q = norm(query);
  if (!q) return [...PLATFORMS];
  const score = (p: PlatformDef) => {
    const n = norm(p.name);
    if (n.startsWith(q) || p.id.startsWith(q)) return 0;
    if (n.split(/[\s()-]+/).some((w) => w.startsWith(q))) return 1;
    if (n.includes(q)) return 2;
    if (p.aliases?.some((a) => norm(a).startsWith(q))) return 3;
    if (p.aliases?.some((a) => norm(a).includes(q))) return 4;
    return 9;
  };
  return PLATFORMS.map((p) => ({ p, s: score(p) })).filter((x) => x.s < 9).sort((a, b) => a.s - b.s).map((x) => x.p);
}

const trimSlash = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();

/** Vrai si le lien n'est que l'adresse officielle (ou vide) : il manque le nom d'utilisateur. */
export function isBareBase(platform: string, url: string): boolean {
  const p = BY_ID.get(platform);
  const v = url.trim();
  if (!v) return true;
  if (!p || p.id === 'website') return false;
  return trimSlash(v) === trimSlash(p.base) || /^https?:\/\/?$/i.test(v);
}

/** Adresse à proposer quand l'utilisateur change de plateforme : on ne remplace jamais ce qu'il a personnalisé. */
export function urlForPlatform(next: string, url: string): string {
  const p = BY_ID.get(next);
  if (!p) return url;
  const v = url.trim();
  const wasUntouched = !v || PLATFORMS.some((x) => trimSlash(x.base) === trimSlash(v)) || /^https?:\/\/?$/i.test(v);
  return wasUntouched ? p.base : url;
}

/** Détecte la plateforme d'un lien collé (par son domaine) ; `null` si inconnue. */
export function detectPlatform(url: string): PlatformDef | null {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
    return PLATFORMS.find((p) => (p.hosts as readonly string[]).some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
  } catch {
    return null;
  }
}
