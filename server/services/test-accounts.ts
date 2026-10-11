/**
 * Comptes de TEST (un par type de profil) pour parcourir chaque tableau de bord et chaque page publique.
 * Contenu manifestement fictif (annoncé comme tel sur chaque page), créé seulement sur demande explicite
 * (SEED_TEST_ACCOUNTS=1), jamais écrasé s'il existe déjà, supprimable d'un seul geste (`removeTestAccounts`).
 * Les images (couverture, avatar, vignettes) sont générées ici en PNG : aucune image externe, aucune donnée réelle.
 */
import { deflateSync } from 'node:zlib';
import { and, eq, isNull, like } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { media, pages, subscriptions, users, type PageContent } from '../db/schema.js';
import { hashPassword, newId, sha256 } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import type { AppearanceConfig } from '../../src/models/appearance.js';
import type { AnyBlock } from '../../src/models/blocks.js';
import type { PlanId } from '../../src/models/auth.js';
import type { CategoryId } from '../../src/models/category.js';

export const TEST_EMAIL_DOMAIN = 'comptes-test.invalid';

// — Images PNG générées (aucune dépendance) —
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RVB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lighten = (c: Rgb, t: number): Rgb => mix(c, [255, 255, 255], t);

/** Couverture : dégradé diagonal + grandes vagues et cercles translucides. */
export function coverPng(from: string, to: string, w = 1000, h = 320): Buffer {
  const a = hex(from);
  const b = hex(to);
  return encodePng(w, h, (x, y) => {
    let c = mix(a, b, Math.min(1, Math.max(0, (x / w) * 0.75 + (y / h) * 0.35)));
    const wave1 = h * 0.62 + Math.sin(x / 120) * 26 + Math.sin(x / 47) * 7;
    const wave2 = h * 0.8 + Math.sin(x / 90 + 2) * 20;
    if (y > wave1) c = lighten(c, 0.12);
    if (y > wave2) c = mix(c, [0, 0, 0], 0.16);
    const d = Math.hypot(x - w * 0.82, y - h * 0.26);
    if (d < h * 0.3) c = lighten(c, 0.28 * (1 - d / (h * 0.3)) + 0.06);
    return [c[0] | 0, c[1] | 0, c[2] | 0];
  });
}

/** Avatar : dégradé + silhouette simple (tête et épaules). */
export function avatarPng(from: string, to: string, size = 256): Buffer {
  const a = hex(from);
  const b = hex(to);
  return encodePng(size, size, (x, y) => {
    let c = mix(a, b, (x + y) / (2 * size));
    const head = Math.hypot(x - size / 2, y - size * 0.4) < size * 0.17;
    const shoulders = Math.hypot((x - size / 2) / 1.35, y - size * 0.98) < size * 0.4 && y > size * 0.62;
    if (head || shoulders) c = lighten(c, 0.82);
    return [c[0] | 0, c[1] | 0, c[2] | 0];
  });
}

/** Vignette (réalisations, produits) : dégradé et formes selon la graine. */
export function thumbPng(seed: number, from: string, to: string, w = 480, h = 360): Buffer {
  const a = hex(from);
  const b = hex(to);
  return encodePng(w, h, (x, y) => {
    let c = mix(a, b, (((x / w) * (1 + (seed % 3) * 0.3) + y / h) / 2) % 1);
    const cx = w * (0.25 + ((seed * 37) % 50) / 100);
    const d = Math.hypot(x - cx, y - h * 0.42);
    if (d < h * 0.24) c = lighten(c, 0.5);
    if (y > h * 0.7 + Math.sin(x / 40 + seed) * 12) c = mix(c, [0, 0, 0], 0.18);
    return [c[0] | 0, c[1] | 0, c[2] | 0];
  });
}

async function storeMedia(db: Db, userId: string, bytes: Buffer, now: Date): Promise<string> {
  const id = `med_${newId('x').slice(2)}`;
  await db.insert(media).values({ id, userId, mime: 'image/png', size: bytes.length, sha256: sha256(bytes.toString('base64')), data: bytes, createdAt: now });
  return `/api/media/${id}`;
}

// — Apparences —
const BASE: AppearanceConfig = {
  themeId: 'minimal',
  colors: { primary: '#111827', accent: '#2563eb', text: '#111827', textMuted: '#4b5563', background: '#ffffff', surface: '#ffffff', border: '#e5e7eb' },
  button: { style: 'filled', radius: 'medium', customRadius: 14 },
  radius: 'medium', customRadius: 14,
  font: { family: 'jakarta', size: 'md', weight: 'medium' },
  layout: { width: 'medium', align: 'center', spacing: 'comfortable', density: 'comfortable', profilePosition: 'top', linkLayout: 'stack', columns: 1 },
  background: { type: 'solid', gradient: { from: '#2563eb', to: '#7c3aed', angle: 160 }, imageUrl: '', overlay: 0.35, pattern: 'dots' },
  cardStyle: 'minimal',
};

interface Spec {
  key: string;
  category: CategoryId;
  plan: PlanId;
  name: string;
  username: string;
  palette: [string, string];
  appearance: AppearanceConfig;
}

const SPECS: Spec[] = [
  {
    key: 'particulier', category: 'individual', plan: 'free', name: 'Fatoumata Soumah', username: 'test-particulier', palette: ['#be185d', '#f59e0b'],
    appearance: { ...BASE, themeId: 'soft', colors: { primary: '#be185d', accent: '#d97706', text: '#3b0d23', textMuted: '#7a4a5e', background: '#fff7f9', surface: '#ffffff', border: '#f5d0dc' }, button: { style: 'gradient', radius: 'large', customRadius: 14 }, radius: 'large', font: { family: 'manrope', size: 'md', weight: 'medium' }, cardStyle: 'floating' },
  },
  {
    key: 'createur', category: 'creator', plan: 'pro', name: 'Mariama Bah', username: 'test-createur', palette: ['#7c3aed', '#ec4899'],
    appearance: { ...BASE, themeId: 'creator', colors: { primary: '#a78bfa', accent: '#f472b6', text: '#f5f3ff', textMuted: '#c4b5fd', background: '#140d2b', surface: '#1f1640', border: '#3b2f6b' }, button: { style: 'gradient', radius: 'pill', customRadius: 14 }, radius: 'large', font: { family: 'manrope', size: 'md', weight: 'bold' }, background: { ...BASE.background, type: 'gradient', gradient: { from: '#1e1b4b', to: '#581c87', angle: 160 } }, cardStyle: 'glass' },
  },
  {
    key: 'professionnel', category: 'professional', plan: 'pro', name: 'Mamadou Keita', username: 'test-professionnel', palette: ['#0f766e', '#2563eb'],
    appearance: { ...BASE, themeId: 'professional', colors: { primary: '#0f766e', accent: '#2563eb', text: '#0f172a', textMuted: '#475569', background: '#f1f5f9', surface: '#ffffff', border: '#e2e8f0' }, button: { style: 'filled', radius: 'medium', customRadius: 14 }, font: { family: 'jakarta', size: 'md', weight: 'medium' }, cardStyle: 'card' },
  },
  {
    key: 'entreprise', category: 'business', plan: 'business', name: 'Kalou Studio', username: 'test-entreprise', palette: ['#b45309', '#0f766e'],
    appearance: { ...BASE, themeId: 'business', colors: { primary: '#b45309', accent: '#0f766e', text: '#1c1917', textMuted: '#57534e', background: '#fffbeb', surface: '#ffffff', border: '#fde68a' }, button: { style: 'filled', radius: 'medium', customRadius: 14 }, font: { family: 'jakarta', size: 'md', weight: 'bold' }, cardStyle: 'floating' },
  },
  {
    key: 'association', category: 'organization', plan: 'business', name: 'Association Fouta Solidaire', username: 'test-association', palette: ['#166534', '#a16207'],
    appearance: { ...BASE, themeId: 'elegant', colors: { primary: '#166534', accent: '#a16207', text: '#14231a', textMuted: '#4d6356', background: '#f0fdf4', surface: '#ffffff', border: '#bbf7d0' }, button: { style: 'outline', radius: 'large', customRadius: 14 }, radius: 'large', font: { family: 'fraunces', size: 'md', weight: 'medium' }, cardStyle: 'flat' },
  },
];

const FICTION = 'Compte de démonstration — contenu fictif.';

interface Imgs { avatar: string; cover: string; thumbs: string[] }

function blocksFor(spec: Spec, img: Imgs, stamp: string): AnyBlock[] {
  const b = <T extends AnyBlock>(block: T): T => ({ ...block, updatedAt: stamp });
  const profile = (headline: string, bio: string, location: string) =>
    b({ id: 'blk_profile', type: 'profile', visible: true, data: { displayName: spec.name, headline, bio: `${bio} ${FICTION}`, avatarUrl: img.avatar, coverUrl: img.cover, location, verified: false } });
  const social = (platforms: Array<'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin' | 'whatsapp' | 'website'>) =>
    b({ id: 'blk_social', type: 'social', visible: true, data: { display: 'icons', items: platforms.map((p) => ({ platform: p, url: p === 'whatsapp' ? 'https://wa.me/224600000000' : `https://www.${p === 'website' ? 'exemple.com' : `${p}.com`}/` })) } });
  switch (spec.key) {
    case 'particulier':
      return [
        profile('Étudiante en design · Conakry', 'Je dessine, je cuisine et je voyage : voici mes liens préférés.', 'Conakry, Guinée'),
        social(['instagram', 'tiktok', 'whatsapp']),
        b({ id: 'blk_about', type: 'text', visible: true, data: { title: 'Un peu de moi', body: 'Passionnée de couleurs et de cuisine, je partage mes projets, mes recettes et mes coups de cœur.\n\nN’hésitez pas à me écrire pour collaborer sur un projet créatif.' } }),
        b({ id: 'blk_l1', type: 'link', visible: true, data: { title: 'Mon portfolio', url: 'https://exemple.com/portfolio', description: 'Projets de design récents', platform: 'link', highlight: true } }),
        b({ id: 'blk_l2', type: 'link', visible: true, data: { title: 'Ma playlist du moment', url: 'https://exemple.com/playlist', description: 'Ce que j’écoute en dessinant', platform: 'link', highlight: false } }),
        b({ id: 'blk_gal', type: 'gallery', visible: true, data: { title: 'Instantanés', images: img.thumbs.slice(0, 6).map((url, i) => ({ url, alt: `Création ${i + 1}` })) } }),
        b({ id: 'blk_wa', type: 'whatsapp', visible: true, data: { label: 'Écrivez-moi sur WhatsApp', phone: '+224 600 00 00 01', message: 'Bonjour Fatoumata !' } }),
      ];
    case 'createur':
      return [
        profile('Créatrice de contenu · Lifestyle & cuisine', 'Recettes guinéennes revisitées, vlogs et collaborations.', 'Conakry · Paris'),
        social(['youtube', 'tiktok', 'instagram', 'facebook']),
        b({ id: 'blk_link', type: 'link', visible: true, data: { title: 'Dernière vidéo', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', description: 'Le riz gras en 20 minutes', platform: 'youtube', highlight: true } }),
        b({ id: 'blk_video', type: 'video', visible: true, data: { title: 'Mon épisode préféré', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' } }),
        b({ id: 'blk_port', type: 'portfolio', visible: true, data: { title: 'Collaborations', items: [{ title: 'Campagne été', description: 'Partenariat boissons', imageUrl: img.thumbs[0]!, url: '' }, { title: 'Série cuisine', description: '12 épisodes', imageUrl: img.thumbs[1]!, url: '' }, { title: 'Festival du goût', description: 'Animation de scène', imageUrl: img.thumbs[2]!, url: '' }] } }),
        b({ id: 'blk_about', type: 'text', visible: true, data: { title: 'Mon histoire', body: 'Depuis 2022, je partage une cuisine généreuse et accessible, ancrée dans les saveurs de Guinée.\n\nKit média disponible pour les marques.' } }),
        b({ id: 'blk_cta', type: 'cta', visible: true, data: { label: 'Proposer une collaboration', url: 'mailto:contact@exemple.com', description: 'Kit média sur demande' } }),
        b({ id: 'blk_mail', type: 'email', visible: true, data: { label: 'Contact presse', email: 'presse@exemple.com', subject: 'Collaboration' } }),
      ];
    case 'professionnel':
      return [
        profile('Développeur web freelance', 'Sites, applications et automatisations pour PME. Disponible pour de nouvelles missions.', 'Conakry · À distance'),
        social(['linkedin', 'website', 'whatsapp']),
        b({ id: 'blk_about', type: 'text', visible: true, data: { title: 'Parcours', body: 'Huit ans d’expérience dans la conception d’outils numériques pour des commerces, des écoles et des ONG.\n\nJe travaille en français et en anglais, en présentiel à Conakry ou à distance.' } }),
        b({ id: 'blk_serv', type: 'service', visible: true, data: { title: 'Services', items: [{ name: 'Site vitrine', description: 'Design sur mesure, rapide et optimisé mobile.', price: 'Dès 2 500 000 GNF', url: '' }, { name: 'Application web', description: 'Outils métiers et tableaux de bord.', price: 'Sur devis', url: '' }, { name: 'Maintenance', description: 'Suivi, sauvegardes et mises à jour.', price: '350 000 GNF / mois', url: '' }] } }),
        b({ id: 'blk_book', type: 'booking', visible: true, data: { title: 'Prendre rendez-vous', phone: '+224 600 00 00 03', availability: 'Lundi – vendredi, 9h – 17h', services: [{ name: 'Appel découverte (20 min)' }, { name: 'Audit de site' }], note: 'Réponse sous 24 h.' } }),
        b({ id: 'blk_link', type: 'link', visible: true, data: { title: 'Voir mes réalisations', url: 'https://exemple.com/work', description: 'Études de cas', platform: 'link', highlight: false } }),
        b({ id: 'blk_vcard', type: 'vcard', visible: true, data: { label: 'Enregistrer mon contact', fullName: 'Mamadou Keita', organization: 'Keita Digital', jobTitle: 'Développeur web', phone: '+224 600 00 00 04', email: 'contact@exemple.com', website: 'https://exemple.com', address: 'Conakry, Guinée', note: '' } }),
        b({ id: 'blk_contact', type: 'contact', visible: true, data: { title: 'Me contacter', items: [{ kind: 'email', label: 'E-mail', value: 'contact@exemple.com' }, { kind: 'whatsapp', label: 'WhatsApp', value: '+224 600 00 00 04' }, { kind: 'address', label: 'Bureau', value: 'Kaloum, Conakry' }] } }),
      ];
    case 'entreprise':
      return [
        profile('Agence de communication visuelle', 'Identité de marque, supports imprimés et contenus numériques pour entreprises ambitieuses.', 'Kaloum, Conakry'),
        social(['instagram', 'facebook', 'linkedin', 'whatsapp']),
        b({ id: 'blk_wa', type: 'whatsapp', visible: true, data: { label: 'Demander un devis', phone: '+224 600 00 00 05', message: 'Bonjour, je souhaite un devis.' } }),
        b({ id: 'blk_serv', type: 'service', visible: true, data: { title: 'Nos expertises', items: [{ name: 'Identité visuelle', description: 'Logo, charte, déclinaisons.', price: 'Dès 1 800 000 GNF', url: '' }, { name: 'Contenus réseaux sociaux', description: 'Plans éditoriaux et création.', price: '', url: '' }, { name: 'Impression', description: 'Cartes, affiches, enseignes.', price: '', url: '' }] } }),
        b({ id: 'blk_shop', type: 'shop', visible: true, data: { title: 'Boutique', phone: '+224 600 00 00 05', currency: 'GNF', altCurrency: 'EUR', altRate: '9500', items: [{ name: 'Pack cartes de visite (100)', description: 'Papier 350 g, finition mate.', price: '250000', imageUrl: img.thumbs[0]! }, { name: 'Affiche A2', description: 'Impression couleur haute qualité.', price: '120000', imageUrl: img.thumbs[1]! }, { name: 'Kit de bienvenue', description: 'Carnet, stylo, sticker, tote bag.', price: '380000', imageUrl: img.thumbs[2]! }], note: 'Livraison à Conakry sous 48 h.' } }),
        b({ id: 'blk_loc', type: 'location', visible: true, data: { label: 'Notre atelier', address: 'Kaloum, Conakry, Guinée', mapUrl: '', hours: 'Lun–Ven · 9h–17h' } }),
        b({ id: 'blk_pay', type: 'payment', visible: true, data: { title: 'Moyens de paiement', note: 'Paiement à la commande, hors plateforme.', methods: [{ provider: 'orange_money', number: '+224 600 00 00 05', holder: 'Kalou Studio' }, { provider: 'cash', number: '', holder: 'À l’atelier' }] } }),
        b({ id: 'blk_phone', type: 'phone', visible: true, data: { label: 'Appeler l’agence', phone: '+224 600 00 00 06' } }),
      ];
    default:
      return [
        profile('Éducation et entraide communautaire', 'Nous soutenons la scolarité des enfants et les initiatives locales.', 'Labé, Guinée'),
        social(['facebook', 'youtube', 'website', 'whatsapp']),
        b({ id: 'blk_about', type: 'text', visible: true, data: { title: 'Notre mission', body: 'Faciliter l’accès à l’éducation et renforcer les liens entre les communautés.\n\nChaque rentrée, nous distribuons des fournitures et finançons des cours de soutien.' } }),
        b({ id: 'blk_port', type: 'portfolio', visible: true, data: { title: 'Projets en cours', items: [{ title: 'Fournitures scolaires', description: 'Rentrée 2026', imageUrl: img.thumbs[0]!, url: '' }, { title: 'Bibliothèque de quartier', description: 'En construction', imageUrl: img.thumbs[1]!, url: '' }, { title: 'Cours de soutien', description: '120 élèves', imageUrl: img.thumbs[2]!, url: '' }] } }),
        b({ id: 'blk_cta', type: 'cta', visible: true, data: { label: 'Rejoindre l’association', url: 'https://exemple.com/rejoindre', description: 'Bénévoles bienvenus' } }),
        b({ id: 'blk_pay', type: 'payment', visible: true, data: { title: 'Soutenir nos actions', note: 'Les dons se font hors plateforme, directement auprès de l’association.', methods: [{ provider: 'orange_money', number: '+224 600 00 00 07', holder: 'Association Fouta Solidaire' }, { provider: 'bank_transfer', number: 'GN00 0000 0000 0000', holder: 'Association Fouta Solidaire' }] } }),
        b({ id: 'blk_loc', type: 'location', visible: true, data: { label: 'Siège', address: 'Labé, Guinée', mapUrl: '', hours: 'Lun–Sam · 8h–16h' } }),
        b({ id: 'blk_contact', type: 'contact', visible: true, data: { title: 'Nous contacter', items: [{ kind: 'email', label: 'E-mail', value: 'contact@exemple.com' }, { kind: 'phone', label: 'Téléphone', value: '+224 600 00 00 07' }] } }),
      ];
  }
}

export interface TestAccountInfo { key: string; email: string; username: string; plan: PlanId; category: CategoryId; created: boolean }

export const testEmail = (key: string) => `${key}@${TEST_EMAIL_DOMAIN}`;

/** Crée les comptes manquants (jamais d'écrasement : un compte existant est laissé tel quel). */
export async function seedTestAccounts(db: Db, password: string, scryptLog2N: number, now = new Date()): Promise<TestAccountInfo[]> {
  const out: TestAccountInfo[] = [];
  const hash = await hashPassword(password, scryptLog2N);
  const stamp = now.toISOString();
  for (const spec of SPECS) {
    const email = testEmail(spec.key);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    const [taken] = existing ? [] : await db.select({ id: pages.id }).from(pages).where(eq(pages.username, spec.username));
    if (existing || taken) {
      out.push({ key: spec.key, email, username: spec.username, plan: spec.plan, category: spec.category, created: false });
      continue;
    }
    const userId = newId('usr');
    await db.insert(users).values({ id: userId, email, passwordHash: hash, name: spec.name, category: spec.category, emailVerifiedAt: now, onboardingDone: true, termsAcceptedAt: now, createdAt: now, updatedAt: now, lastActiveAt: now });
    await db.insert(subscriptions).values({ id: newId('sub'), userId, planId: spec.plan, status: 'active', startedAt: now, updatedAt: now });
    const [c1, c2] = spec.palette;
    const img: Imgs = {
      avatar: await storeMedia(db, userId, avatarPng(c1, c2), now),
      cover: await storeMedia(db, userId, coverPng(c1, c2), now),
      thumbs: [],
    };
    const tints: Array<[string, string]> = [[c1, c2], [c2, c1], ['#0ea5e9', c1], ['#22c55e', c2], ['#f97316', c1], ['#6366f1', c2]];
    for (let i = 0; i < tints.length; i++) img.thumbs.push(await storeMedia(db, userId, thumbPng(i + 1, tints[i]![0], tints[i]![1]), now));
    const content: PageContent = {
      blocks: blocksFor(spec, img, stamp),
      appearance: spec.appearance,
      share: { title: spec.name, description: FICTION },
      category: spec.category,
    };
    await db.insert(pages).values({ id: newId('pg'), userId, username: spec.username, status: 'published', draft: content, published: content, version: 1, createdAt: now, updatedAt: now, publishedAt: now });
    await audit(db, { actorId: null, actorLabel: 'Amorçage', action: 'Compte de test créé', target: email, ip: null }, now);
    out.push({ key: spec.key, email, username: spec.username, plan: spec.plan, category: spec.category, created: true });
  }
  return out;
}

/** Supprime les comptes de test (pages, images et abonnements partent en cascade). N'atteint jamais un compte administrateur. */
export async function removeTestAccounts(db: Db): Promise<number> {
  const rows = await db.delete(users).where(and(like(users.email, `%@${TEST_EMAIL_DOMAIN}`), isNull(users.adminRole))).returning({ id: users.id });
  return rows.length;
}
