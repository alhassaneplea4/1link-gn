/** Modèles de données des blocs. Un nouveau type = une entrée ici + une définition dans le registre. */

export const BLOCK_TYPES = [
  'profile', 'text', 'link', 'social', 'service', 'portfolio', 'gallery', 'video',
  'contact', 'email', 'phone', 'whatsapp', 'vcard', 'location', 'qr', 'divider', 'cta',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'whatsapp', 'telegram', 'website'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface ProfileData {
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  location: string;
  verified: boolean;
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
  location: LocationData;
  qr: QrData;
  divider: DividerData;
  cta: CtaData;
}

export interface Block<T extends BlockType = BlockType> {
  id: string;
  type: T;
  visible: boolean;
  data: BlockDataMap[T];
  /** Dernière modification (ISO), renseignée par l'éditeur. */
  updatedAt?: string;
}
/** Union discriminante : `block.type` affine `block.data`. */
export type AnyBlock = { [K in BlockType]: Block<K> }[BlockType];

export const isBlockType = (v: unknown): v is BlockType => typeof v === 'string' && (BLOCK_TYPES as readonly string[]).includes(v);
