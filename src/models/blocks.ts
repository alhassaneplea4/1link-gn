/** Modèles de données des blocs. Un nouveau type = une entrée ici + une définition dans le registre. */

export const BLOCK_TYPES = [
  'profile', 'text', 'link', 'social', 'service', 'portfolio', 'gallery', 'video',
  'contact', 'email', 'phone', 'whatsapp', 'vcard', 'booking', 'shop', 'payment', 'location', 'qr', 'divider', 'cta',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Plateformes proposées pour les réseaux et les liens. Liste volontairement littérale (ce module est partagé avec le serveur et
 * doit rester une feuille) ; le catalogue complet — nom, adresse officielle, recherche — est `platforms.ts`, qui doit rester identique
 * (vérifié par un test).
 */
export const SOCIAL_PLATFORMS = [
  'instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp', 'telegram', 'x', 'linkedin', 'snapchat', 'threads', 'discord', 'twitch', 'pinterest', 'reddit', 'messenger', 'signal', 'line', 'spotify', 'applemusic', 'soundcloud', 'deezer', 'audiomack', 'boomplay', 'vimeo', 'kick', 'github', 'gitlab', 'stackoverflow', 'behance', 'dribbble', 'medium', 'tumblr', 'flickr', 'patreon', 'kofi', 'buymeacoffee', 'calendly', 'googleplay', 'appstore', 'mastodon', 'bluesky', 'vk', 'quora', 'website'
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface ProfileData {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  location: string;
  /** Secteur d'activité (ex. « Restauration », « Éducation »). */
  sector?: string;
  verified: boolean;
  /** Badges mérités (calculés par le serveur : abonnement, vérification, équipe). */
  badges?: ('official' | 'team' | 'verified' | 'business' | 'pro')[];
}
export interface TextData { title: string; body: string }
export interface LinkData { title: string; url: string; description: string; platform: SocialPlatform | 'link'; highlight: boolean }
export interface SocialItem { platform: SocialPlatform; url: string }
export interface SocialData { items: SocialItem[]; display: 'icons' | 'list' }
export interface ServiceItem { name: string; description: string; price: string; url: string }
export interface ServiceData { title: string; items: ServiceItem[] }
export interface PortfolioItem { title: string; description: string; imageUrl: string; url: string }
export interface PortfolioData { title: string; items: PortfolioItem[] }
export interface GalleryImage { url: string; alt: string }
export interface GalleryData { title: string; images: GalleryImage[] }
export interface VideoData { title: string; url: string }
export interface ContactItem { kind: 'email' | 'phone' | 'whatsapp' | 'address' | 'website'; label: string; value: string }
export interface ContactData { title: string; items: ContactItem[] }
export interface EmailData { label: string; email: string; subject: string }
export interface PhoneData { label: string; phone: string }
export interface WhatsappData { label: string; phone: string; message: string }
export interface VcardData { label: string; fullName: string; organization: string; jobTitle: string; phone: string; email: string; website: string; address: string; note: string }
export interface BookingService { name: string }
/** Demande de rendez-vous envoyée par le visiteur sur WhatsApp : aucune donnée n'est stockée par 1Link. */
export interface BookingData { title: string; phone: string; availability: string; services: BookingService[]; note: string }
export const CURRENCIES = ['GNF', 'XOF', 'XAF', 'EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];
export interface ShopItem { name: string; description: string; price: string; imageUrl: string }
/** Catalogue : la commande part par WhatsApp. Aucune transaction n'est traitée par 1Link. */
export interface ShopData {
  title: string;
  phone: string;
  currency: Currency;
  /** Devise d'équivalence affichée aux visiteurs de la diaspora (`none` = aucune). */
  altCurrency?: Currency | 'none';
  /** Taux défini PAR LE VENDEUR : combien d'unités de `currency` valent 1 unité de `altCurrency`. */
  altRate?: string;
  items: ShopItem[];
  note: string;
}
export const PAYMENT_PROVIDERS = ['orange_money', 'mtn_momo', 'moov_money', 'wave', 'bank_transfer', 'cash', 'other'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export interface PaymentMethod { provider: PaymentProvider; number: string; holder: string }
/** Affichage d'informations de paiement uniquement : 1Link n'encaisse ni ne transfère d'argent. */
export interface PaymentData { title: string; note: string; methods: PaymentMethod[] }
export interface LocationData { label: string; address: string; mapUrl: string; hours: string }
export interface QrData { label: string; target: 'page' | 'custom'; url: string }
export interface DividerData { style: 'line' | 'dots' | 'space'; label: string }
export interface CtaData { label: string; url: string; description: string }

export interface BlockDataMap {
  profile: ProfileData;
  text: TextData;
  link: LinkData;
  social: SocialData;
  service: ServiceData;
  portfolio: PortfolioData;
  gallery: GalleryData;
  video: VideoData;
  contact: ContactData;
  email: EmailData;
  phone: PhoneData;
  whatsapp: WhatsappData;
  vcard: VcardData;
  booking: BookingData;
  shop: ShopData;
  payment: PaymentData;
  location: LocationData;
  qr: QrData;
  divider: DividerData;
  cta: CtaData;
}

/** Fenêtre d'affichage d'un bloc (ISO UTC). `null` = pas de borne. */
export interface BlockSchedule { from: string | null; until: string | null }

export interface Block<T extends BlockType = BlockType> {
  id: string;
  type: T;
  visible: boolean;
  data: BlockDataMap[T];
  /** Dernière modification (ISO), renseignée par l'éditeur. */
  updatedAt?: string;
  /** Programmation : le bloc n'est visible publiquement que dans cette fenêtre. */
  schedule?: BlockSchedule;
}
/** Union discriminante : `block.type` affine `block.data`. */
export type AnyBlock = { [K in BlockType]: Block<K> }[BlockType];

export const isBlockType = (v: unknown): v is BlockType => typeof v === 'string' && (BLOCK_TYPES as readonly string[]).includes(v);
