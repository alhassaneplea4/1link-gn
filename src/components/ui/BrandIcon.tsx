import {
  siApplemusic, siAppstore, siAudiomack, siBehance, siBluesky, siBuymeacoffee, siCalendly, siDeezer, siDiscord, siDribbble, siFacebook,
  siFlickr, siGithub, siGitlab, siGoogleplay, siInstagram, siKick, siKofi, siLine, siMastodon, siMedium, siMessenger, siPatreon,
  siPinterest, siQuora, siReddit, siSignal, siSnapchat, siSoundcloud, siSpotify, siStackoverflow, siTelegram, siThreads, siTiktok,
  siTumblr, siTwitch, siVimeo, siVk, siWhatsapp, siX, siYoutube,
} from 'simple-icons';
import { Icon, type IconName } from './Icon';

interface Glyph { path: string; hex: string }
const g = (i: { path: string; hex: string }): Glyph => ({ path: i.path, hex: i.hex });

/** Logos officiels (simple-icons, domaine public CC0). LinkedIn et Boomplay n'y figurent pas : repli sur un glyphe interne. */
const GLYPHS: Record<string, Glyph> = {
  instagram: g(siInstagram), facebook: g(siFacebook), tiktok: g(siTiktok), youtube: g(siYoutube), whatsapp: g(siWhatsapp), telegram: g(siTelegram),
  x: g(siX), snapchat: g(siSnapchat), threads: g(siThreads), discord: g(siDiscord), twitch: g(siTwitch), pinterest: g(siPinterest), reddit: g(siReddit),
  messenger: g(siMessenger), signal: g(siSignal), line: g(siLine), spotify: g(siSpotify), applemusic: g(siApplemusic), soundcloud: g(siSoundcloud),
  deezer: g(siDeezer), audiomack: g(siAudiomack), vimeo: g(siVimeo), kick: g(siKick), github: g(siGithub), gitlab: g(siGitlab),
  stackoverflow: g(siStackoverflow), behance: g(siBehance), dribbble: g(siDribbble), medium: g(siMedium), tumblr: g(siTumblr), flickr: g(siFlickr),
  patreon: g(siPatreon), kofi: g(siKofi), buymeacoffee: g(siBuymeacoffee), calendly: g(siCalendly), googleplay: g(siGoogleplay), appstore: g(siAppstore),
  mastodon: g(siMastodon), bluesky: g(siBluesky), vk: g(siVk), quora: g(siQuora),
};

const FALLBACK: Record<string, IconName> = { linkedin: 'linkedin', boomplay: 'music', website: 'globe', link: 'link' };

/** Couleur de marque (sans `#`) quand elle est connue : sert aux pastilles du sélecteur. */
export const brandColor = (id: string): string | null => {
  if (id === 'linkedin') return '0A66C2';
  if (id === 'x') return '111111';
  return GLYPHS[id]?.hex ?? null;
};

/** Logo d'une plateforme (identifiant du catalogue `models/platforms`) ; `link`/`website` = glyphes génériques. */
export function BrandIcon({ platform, size = 20, className }: { platform: string; size?: number; className?: string }) {
  const glyph = GLYPHS[platform];
  if (!glyph) return <Icon name={FALLBACK[platform] ?? 'link'} size={size} className={className} />;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={glyph.path} />
    </svg>
  );
}
