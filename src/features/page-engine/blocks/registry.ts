/**
 * Registre des types de blocs. Pour ajouter un type :
 *   1. déclarer son modèle dans models/blocks.ts,
 *   2. ajouter ici une définition (schéma de champs + création + résumé + rendu),
 *   3. ajouter ses libellés (editor.blocks.<type>.*).
 * L'éditeur (formulaire, validation, liste) et la page publique s'adaptent sans autre modification.
 */
import { parseRate } from './money';
import { BLOCK_TYPES, CURRENCIES, PAYMENT_PROVIDERS, type AnyBlock, type Block, type BlockType } from '@/models/blocks';
import { uid } from '@/utilities/misc';
import { validateFields, type FieldDef, type FieldErrors } from './schema';
import { scheduleError } from '../schedule';
import type { BlockDefinition, BlockGroup, BlockRegistry, CreateContext } from './types';
import { ProfileRender } from './render/profile';
import { CtaRender, EmailRender, LinkRender, PhoneRender, SocialRender, WhatsappRender } from './render/links';
import { DividerRender, GalleryRender, PortfolioRender, ServiceRender, TextRender, VideoRender } from './render/content';
import { ContactRender, LocationRender, QrRender } from './render/places';
import { VcardRender } from './render/vcard';
import { PaymentRender, ShopRender } from './render/commerce';
import { BookingRender } from './render/booking';

const text = (name: string, o: { required?: boolean; max?: number } = {}): FieldDef => ({ kind: 'text', name, ...o });
const area = (name: string, o: { required?: boolean; max?: number } = {}): FieldDef => ({ kind: 'textarea', name, ...o });
const url = (name: string, o: { required?: boolean } = {}): FieldDef => ({ kind: 'url', name, ...o });
const image = (name: string, o: { required?: boolean } = {}): FieldDef => ({ kind: 'image', name, ...o });

const def = <K extends BlockType>(d: BlockDefinition<K>): BlockDefinition<K> => d;

export const blockRegistry: BlockRegistry = {
  profile: def({
    type: 'profile', group: 'identity', icon: 'user', singleton: true, required: true,
    fields: [text('displayName', { required: true, max: 60 }), text('headline', { max: 90 }), area('bio', { max: 320 }), image('avatarUrl'), image('coverUrl'), text('sector', { max: 60 }), text('location', { max: 60 })],
    create: () => ({ displayName: '', headline: '', bio: '', avatarUrl: '', coverUrl: '', location: '', sector: '', verified: false }),
    summary: (d) => d.displayName || d.headline,
    Render: ProfileRender,
  }),
  text: def({
    type: 'text', group: 'content', icon: 'file',
    fields: [text('title', { max: 80 }), area('body', { required: true, max: 1200 })],
    create: () => ({ title: '', body: '' }),
    summary: (d) => d.title || d.body,
    Render: TextRender,
  }),
  link: def({
    type: 'link', group: 'links', icon: 'link',
    fields: [text('title', { required: true, max: 80 }), url('url', { required: true }), text('description', { max: 120 }), { kind: 'platform', name: 'platform', allowLink: true }, { kind: 'toggle', name: 'highlight' }],
    create: () => ({ title: '', url: '', description: '', platform: 'link', highlight: false }),
    summary: (d) => d.title || d.url,
    Render: LinkRender,
  }),
  social: def({
    type: 'social', group: 'links', icon: 'share',
    fields: [
      { kind: 'select', name: 'display', options: ['icons', 'list'] },
      { kind: 'list', name: 'items', max: 12, defaultItem: { platform: 'instagram', url: 'https://instagram.com/' }, itemFields: [{ kind: 'platform', name: 'platform' }, url('url', { required: true })] },
    ],
    create: () => ({ display: 'icons', items: [{ platform: 'instagram', url: 'https://instagram.com/' }] }),
    summary: (d) => d.items.map((i) => i.platform).join(' · '),
    Render: SocialRender,
  }),
  service: def({
    type: 'service', group: 'content', icon: 'briefcase',
    fields: [
      text('title', { max: 80 }),
      { kind: 'list', name: 'items', max: 12, defaultItem: { name: '', description: '', price: '', url: '' }, itemFields: [text('name', { required: true, max: 80 }), area('description', { max: 240 }), text('price', { max: 40 }), url('url')] },
    ],
    create: () => ({ title: '', items: [{ name: '', description: '', price: '', url: '' }] }),
    summary: (d) => d.title || d.items.map((i) => i.name).filter(Boolean).join(', '),
    Render: ServiceRender,
  }),
  portfolio: def({
    type: 'portfolio', group: 'content', icon: 'layers',
    fields: [
      text('title', { max: 80 }),
      { kind: 'list', name: 'items', max: 12, defaultItem: { title: '', description: '', imageUrl: '', url: '' }, itemFields: [text('title', { required: true, max: 80 }), area('description', { max: 200 }), image('imageUrl'), url('url')] },
    ],
    create: () => ({ title: '', items: [{ title: '', description: '', imageUrl: '', url: '' }] }),
    summary: (d) => d.title || d.items.map((i) => i.title).filter(Boolean).join(', '),
    Render: PortfolioRender,
  }),
  gallery: def({
    type: 'gallery', group: 'content', icon: 'image',
    fields: [
      text('title', { max: 80 }),
      { kind: 'list', name: 'images', max: 12, defaultItem: { url: '', alt: '' }, itemFields: [image('url', { required: true }), text('alt', { required: true, max: 120 })] },
    ],
    create: () => ({ title: '', images: [{ url: '', alt: '' }] }),
    summary: (d) => d.title || `${d.images.length}`,
    Render: GalleryRender,
  }),
  video: def({
    type: 'video', group: 'content', icon: 'video',
    fields: [text('title', { max: 80 }), url('url', { required: true })],
    create: () => ({ title: '', url: '' }),
    summary: (d) => d.title || d.url,
    Render: VideoRender,
  }),
  contact: def({
    type: 'contact', group: 'contact', icon: 'users',
    fields: [
      text('title', { max: 80 }),
      { kind: 'list', name: 'items', max: 8, defaultItem: { kind: 'email', label: '', value: '' }, itemFields: [{ kind: 'select', name: 'kind', options: ['email', 'phone', 'whatsapp', 'address', 'website'] }, text('label', { max: 60 }), text('value', { required: true, max: 160 })] },
    ],
    create: () => ({ title: '', items: [{ kind: 'email', label: '', value: '' }] }),
    summary: (d) => d.title || d.items.map((i) => i.value).filter(Boolean).join(', '),
    Render: ContactRender,
  }),
  email: def({
    type: 'email', group: 'contact', icon: 'mail',
    fields: [text('label', { max: 60 }), { kind: 'email', name: 'email', required: true }, text('subject', { max: 120 })],
    create: () => ({ label: '', email: '', subject: '' }),
    summary: (d) => d.label || d.email,
    Render: EmailRender,
  }),
  phone: def({
    type: 'phone', group: 'contact', icon: 'phone',
    fields: [text('label', { max: 60 }), { kind: 'tel', name: 'phone', required: true }],
    create: () => ({ label: '', phone: '' }),
    summary: (d) => d.label || d.phone,
    Render: PhoneRender,
  }),
  whatsapp: def({
    type: 'whatsapp', group: 'contact', icon: 'whatsapp',
    fields: [text('label', { max: 60 }), { kind: 'tel', name: 'phone', required: true }, area('message', { max: 240 })],
    create: () => ({ label: '', phone: '', message: '' }),
    summary: (d) => d.label || d.phone,
    Render: WhatsappRender,
  }),
  vcard: def({
    type: 'vcard', group: 'contact', icon: 'user-check',
    fields: [text('label', { max: 60 }), text('fullName', { required: true, max: 80 }), text('organization', { max: 80 }), text('jobTitle', { max: 80 }), { kind: 'tel', name: 'phone' }, { kind: 'email', name: 'email' }, url('website'), text('address', { max: 200 }), area('note', { max: 240 })],
    create: () => ({ label: '', fullName: '', organization: '', jobTitle: '', phone: '', email: '', website: '', address: '', note: '' }),
    summary: (d) => d.fullName || d.phone || d.email,
    Render: VcardRender,
  }),
  booking: def({
    type: 'booking', group: 'contact', icon: 'calendar',
    fields: [
      text('title', { max: 80 }),
      { kind: 'tel', name: 'phone', required: true },
      area('availability', { max: 200 }),
      { kind: 'list', name: 'services', max: 10, defaultItem: { name: '' }, itemFields: [text('name', { required: true, max: 80 })] },
      area('note', { max: 240 }),
    ],
    create: () => ({ title: '', phone: '', availability: '', services: [], note: '' }),
    summary: (d) => d.title || d.availability || d.phone,
    Render: BookingRender,
  }),
  shop: def({
    type: 'shop', group: 'content', icon: 'store',
    fields: [
      text('title', { max: 80 }),
      { kind: 'tel', name: 'phone', required: true },
      { kind: 'select', name: 'currency', options: CURRENCIES },
      { kind: 'select', name: 'altCurrency', options: ['none', ...CURRENCIES] },
      { kind: 'number', name: 'altRate' },
      { kind: 'list', name: 'items', max: 24, defaultItem: { name: '', description: '', price: '', imageUrl: '' }, itemFields: [text('name', { required: true, max: 80 }), area('description', { max: 200 }), { kind: 'number', name: 'price' }, image('imageUrl')] },
      area('note', { max: 240 }),
    ],
    validate: (d): FieldErrors => {
      if (!d.altCurrency || d.altCurrency === 'none') return {};
      if (d.altCurrency === d.currency) return { altCurrency: 'common.validation.sameCurrency' };
      return parseRate(d.altRate ?? '') === null ? { altRate: 'common.validation.rate' } : {};
    },
    create: () => ({ title: '', phone: '', currency: 'GNF', altCurrency: 'none', altRate: '', items: [{ name: '', description: '', price: '', imageUrl: '' }], note: '' }),
    summary: (d) => d.title || d.items.map((i) => i.name).filter(Boolean).join(', '),
    Render: ShopRender,
  }),
  payment: def({
    type: 'payment', group: 'contact', icon: 'wallet',
    fields: [
      text('title', { max: 80 }),
      { kind: 'list', name: 'methods', max: 8, defaultItem: { provider: 'orange_money', number: '', holder: '' }, itemFields: [{ kind: 'select', name: 'provider', options: PAYMENT_PROVIDERS }, text('number', { required: true, max: 40 }), text('holder', { max: 80 })] },
      area('note', { max: 240 }),
    ],
    create: () => ({ title: '', note: '', methods: [{ provider: 'orange_money', number: '', holder: '' }] }),
    summary: (d) => d.title || d.methods.map((m) => m.provider).join(' · '),
    Render: PaymentRender,
  }),
  location: def({
    type: 'location', group: 'contact', icon: 'pin',
    fields: [text('label', { max: 80 }), text('address', { required: true, max: 200 }), url('mapUrl'), text('hours', { max: 120 })],
    create: () => ({ label: '', address: '', mapUrl: '', hours: '' }),
    summary: (d) => d.label || d.address,
    Render: LocationRender,
  }),
  qr: def({
    type: 'qr', group: 'layout', icon: 'qr', singleton: true,
    fields: [text('label', { max: 80 }), { kind: 'select', name: 'target', options: ['page', 'custom'] }, url('url')],
    create: () => ({ label: '', target: 'page', url: '' }),
    summary: (d) => d.label || d.target,
    Render: QrRender,
  }),
  divider: def({
    type: 'divider', group: 'layout', icon: 'minus',
    fields: [{ kind: 'select', name: 'style', options: ['line', 'dots', 'space'] }, text('label', { max: 60 })],
    create: () => ({ style: 'line', label: '' }),
    summary: (d) => d.label || d.style,
    Render: DividerRender,
  }),
  cta: def({
    type: 'cta', group: 'links', icon: 'rocket',
    fields: [text('label', { required: true, max: 60 }), url('url', { required: true }), text('description', { max: 140 })],
    create: () => ({ label: '', url: '', description: '' }),
    summary: (d) => d.label || d.url,
    Render: CtaRender,
  }),
};

export const getBlockDefinition = <K extends BlockType>(type: K): BlockDefinition<K> => blockRegistry[type] as unknown as BlockDefinition<K>;

export const BLOCK_GROUPS: readonly BlockGroup[] = ['identity', 'links', 'content', 'contact', 'layout'];
export const blockTypesByGroup = (group: BlockGroup): BlockType[] => BLOCK_TYPES.filter((t) => blockRegistry[t].group === group);

export function createBlock<K extends BlockType>(type: K, ctx: CreateContext, id = uid('blk')): Block<K> {
  return { id, type, visible: true, data: getBlockDefinition(type).create(ctx), updatedAt: new Date().toISOString() } as Block<K>;
}

/** Valide un bloc d'après son schéma. */
export function validateBlock(block: AnyBlock): FieldErrors {
  const errors = validateFields(blockRegistry[block.type].fields, block.data as unknown as Record<string, unknown>) as Record<string, string>;
  if (scheduleError(block.schedule)) errors.schedule = 'common.validation.schedule';
  const def = blockRegistry[block.type] as BlockDefinition<BlockType>;
  Object.assign(errors, def.validate?.(block.data as never) ?? {});
  return errors as FieldErrors;
}

export const isBlockComplete = (block: AnyBlock) => Object.keys(validateBlock(block)).length === 0;

/**
 * Affichable aux visiteurs : comme `isBlockComplete`, sauf qu'un réseau resté à l'adresse officielle (nom d'utilisateur oublié)
 * ne masque pas tout le bloc — seul cet élément est omis au rendu.
 */
export const isBlockRenderable = (block: AnyBlock) => Object.values(validateBlock(block)).every((e) => e === 'common.validation.profileMissing');

export function blockSummary(block: AnyBlock): string {
  return (blockRegistry[block.type] as BlockDefinition<BlockType>).summary(block.data as never);
}
