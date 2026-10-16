/**
 * Validation SERVEUR d'une page. L'interface valide déjà ses formulaires, mais le serveur ne lui fait jamais confiance :
 * types, énumérations, longueurs, schémas d'URL dangereux (javascript:, data:…), tailles. Les clés inconnues sont retirées.
 *  - mode `draft` : tolérant sur le format (un brouillon peut être incomplet), strict sur la sécurité ;
 *  - mode `publish` : ce que verront les visiteurs doit être valide (liens, e-mails, téléphones, images).
 */
import { z } from 'zod';
import { BLOCK_TYPES, CURRENCIES, PAYMENT_PROVIDERS, SOCIAL_PLATFORMS, type AnyBlock, type BlockDataMap, type BlockType } from '../../src/models/blocks.js';
import { BACKGROUND_TYPES, BUTTON_STYLES, CARD_STYLES, FONT_IDS, PATTERNS, RADIUS_KEYS, THEME_IDS, type AppearanceConfig } from '../../src/models/appearance.js';
import { CATEGORY_IDS } from '../../src/models/category.js';
import { isHex } from '../../src/utilities/color.js';
import { isEmail, isLink, isPhone, isUrl } from '../../src/utilities/validation.js';

export type PageMode = 'draft' | 'publish';

/** Emplacement des images téléversées sur ce serveur. */
export const MEDIA_PATH = /^\/api\/media\/med_[a-f0-9]{20}$/;
const DANGEROUS_SCHEME = /^\s*(?:javascript|data|vbscript|file|blob)\s*:/i;

const isoDate = z.iso.datetime({ offset: true });

function build(mode: PageMode) {
  const strict = mode === 'publish';
  const str = (max: number) => z.string().max(strict ? max : Math.max(max * 3, 400)).default('');

  const link = z.string().max(2048).default('').refine((v) => !DANGEROUS_SCHEME.test(v), 'unsafe_url').refine((v) => !strict || v.trim() === '' || isLink(v), 'url');
  const image = z.string().max(2048).default('').refine((v) => !DANGEROUS_SCHEME.test(v), 'unsafe_url').refine((v) => !strict || v.trim() === '' || isUrl(v) || MEDIA_PATH.test(v.trim()), 'url');
  const email = z.string().max(254).default('').refine((v) => !strict || v.trim() === '' || isEmail(v), 'email');
  const tel = z.string().max(40).default('').refine((v) => !strict || v.trim() === '' || isPhone(v), 'phone');
  const list = <T extends z.ZodType>(item: T, max: number) => z.array(item).max(max).default([]);

  const data: { [K in BlockType]: z.ZodType<BlockDataMap[K], unknown> } = {
    profile: z.object({ displayName: str(60), headline: str(90), bio: str(320), avatarUrl: image, coverUrl: image, location: str(60), sector: str(60), verified: z.boolean().default(false) }),
    text: z.object({ title: str(80), body: str(1200) }),
    link: z.object({ title: str(80), url: link, description: str(120), platform: z.enum(['link', ...SOCIAL_PLATFORMS]).default('link'), highlight: z.boolean().default(false) }),
    social: z.object({ items: list(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: link }), 12), display: z.enum(['icons', 'list']).default('icons') }),
    service: z.object({ title: str(80), items: list(z.object({ name: str(80), description: str(240), price: str(40), url: link }), 12) }),
    portfolio: z.object({ title: str(80), items: list(z.object({ title: str(80), description: str(200), imageUrl: image, url: link }), 12) }),
    gallery: z.object({ title: str(80), images: list(z.object({ url: image, alt: str(120) }), strict ? 5 : 12) }),
    video: z.object({ title: str(80), url: link }),
    contact: z.object({ title: str(80), items: list(z.object({ kind: z.enum(['email', 'phone', 'whatsapp', 'address', 'website']), label: str(60), value: str(160) }), 8) }),
    email: z.object({ label: str(60), email, subject: str(120) }),
    phone: z.object({ label: str(60), phone: tel }),
    whatsapp: z.object({ label: str(60), phone: tel, message: str(240) }),
    vcard: z.object({ label: str(60), fullName: str(80), organization: str(80), jobTitle: str(80), phone: tel, email, website: link, address: str(200), note: str(240) }),
    booking: z.object({ title: str(80), phone: tel, availability: str(200), services: list(z.object({ name: str(80) }), 10), note: str(240) }),
    shop: z.object({
      title: str(80), phone: tel, currency: z.enum(CURRENCIES).default('GNF'), altCurrency: z.enum(['none', ...CURRENCIES]).default('none'), altRate: str(24),
      items: list(z.object({ name: str(80), description: str(200), price: str(40), imageUrl: image }), 24), note: str(240),
    }),
    payment: z.object({ title: str(80), note: str(240), methods: list(z.object({ provider: z.enum(PAYMENT_PROVIDERS), number: str(40), holder: str(80) }), 8) }),
    location: z.object({ label: str(80), address: str(200), mapUrl: link, hours: str(120) }),
    qr: z.object({ label: str(80), target: z.enum(['page', 'custom']).default('page'), url: link }),
    divider: z.object({ style: z.enum(['line', 'dots', 'space']).default('line'), label: str(60) }),
    cta: z.object({ label: str(80), url: link, description: str(160) }),
  };

  const schedule = z
    .object({ from: isoDate.nullable(), until: isoDate.nullable() })
    .refine((s) => !s.from || !s.until || new Date(s.from) < new Date(s.until), { message: 'schedule', path: ['until'] });

  const envelope = {
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'id'),
    visible: z.boolean(),
    updatedAt: z.string().max(40).optional(),
    schedule: schedule.optional(),
  };
  const variants = BLOCK_TYPES.map((t) => z.object({ ...envelope, type: z.literal(t), data: data[t] }));
  const block = z.discriminatedUnion('type', variants as unknown as [(typeof variants)[number], ...(typeof variants)[number][]]) as unknown as z.ZodType<AnyBlock, unknown>;

  const hex = z.string().refine(isHex, 'color');
  const radius = z.enum(RADIUS_KEYS);
  const px = z.number().min(0).max(80);
  const appearance: z.ZodType<AppearanceConfig, unknown> = z.object({
    themeId: z.enum(THEME_IDS),
    colors: z.object({ primary: hex, accent: hex, text: hex, textMuted: hex, background: hex, surface: hex, border: hex }),
    button: z.object({ style: z.enum(BUTTON_STYLES), radius, customRadius: px }),
    radius,
    customRadius: px,
    font: z.object({ family: z.enum(FONT_IDS), size: z.enum(['sm', 'md', 'lg']), weight: z.enum(['regular', 'medium', 'bold']) }),
    layout: z.object({
      width: z.enum(['narrow', 'medium', 'wide']), align: z.enum(['left', 'center']), spacing: z.enum(['compact', 'comfortable', 'spacious']),
      density: z.enum(['cozy', 'comfortable', 'airy']), profilePosition: z.enum(['top', 'left', 'cover']), linkLayout: z.enum(['stack', 'grid']),
      columns: z.union([z.literal(1), z.literal(2)]),
    }),
    background: z.object({
      type: z.enum(BACKGROUND_TYPES), gradient: z.object({ from: hex, to: hex, angle: z.number().min(0).max(360) }),
      imageUrl: image, overlay: z.number().min(0).max(1), pattern: z.enum(PATTERNS),
    }),
    cardStyle: z.enum(CARD_STYLES),
  });

  return z.object({
    username: z.string().trim().toLowerCase().max(30).default(''),
    category: z.enum(CATEGORY_IDS),
    blocks: z.array(block).max(500),
    appearance,
    share: z.object({ title: z.string().max(120).default(''), description: z.string().max(300).default('') }),
    version: z.number().int().min(0).max(2_000_000_000),
  });
}

const cache: Partial<Record<PageMode, ReturnType<typeof build>>> = {};
export const pageInput = (mode: PageMode) => (cache[mode] ??= build(mode));
export type PageInput = z.infer<ReturnType<typeof build>>;

/** Garde-fou de taille sur le document entier (en plus des plafonds par champ). */
export const MAX_DOC_BYTES = 400_000;
