/**
 * 1Link Cards — cartes de visite physiques (QR, ou QR + puce NFC) liées au profil public.
 * Module partagé avec le serveur (qui fait autorité sur les prix, les statuts et les droits) : doit rester une feuille
 * (aucun import d'exécution). Les modèles graphiques sont du code (ils décrivent des mises en page), jamais des données utilisateur.
 */

export type CardKind = 'qr' | 'nfc';
export const CARD_KINDS: readonly CardKind[] = ['qr', 'nfc'];

/** Identifiants des produits vendus ; les prix, eux, sont des données (table `card_products`, modifiables en administration). */
export const CARD_PRODUCT_IDS = ['qr_basic', 'nfc_premium', 'qr_pack10', 'nfc_pack10'] as const;
export type CardProductId = (typeof CARD_PRODUCT_IDS)[number];

export interface CardProduct {
  id: CardProductId;
  kind: CardKind;
  /** Nombre de cartes livrées pour une unité achetée (1 ou 10). */
  quantity: number;
  /** Prix d'une unité (entier, dans `currency`). */
  price: number;
  currency: string;
  active: boolean;
}

/** Un seul achat peut porter au plus ce nombre de cartes (protège la production et la base). */
export const MAX_CARDS_PER_ORDER = 200;
export const MAX_UNITS_PER_LINE = 50;

// — Géométrie d'impression (mm). Format de référence ISO/IEC 7810 ID-1 : 85,6 × 54 mm. —
export const CARD_TRIM = { w: 85.6, h: 54 } as const;
/** Fond perdu de chaque côté : le fond déborde de la coupe pour éviter un liseré blanc. */
export const CARD_BLEED = 3;
/** Marge de sécurité intérieure : aucun texte ni QR code plus près du bord de coupe. */
export const CARD_SAFE = 4;
export const PRINT_DPI = 600;

// — Modèles graphiques —
export const CARD_TEMPLATE_IDS = ['classic_white', 'premium_black', 'gradient', 'emerald', 'sunset', 'ocean', 'sand', 'guinea'] as const;
export type CardTemplateId = (typeof CARD_TEMPLATE_IDS)[number];
export type CardLayout = 'left' | 'center' | 'band';

export interface CardTemplate {
  id: CardTemplateId;
  layout: CardLayout;
  background: { type: 'solid'; color: string } | { type: 'gradient'; from: string; to: string; angle: number };
  text: string;
  muted: string;
  /** Couleurs d'accent permises (la première est celle par défaut) : la personnalisation reste dans les limites du design. */
  accents: readonly string[];
  /** Le verso porte le QR code sur une pastille claire pour rester lisible quel que soit le fond. */
  qrTile: string;
}

export const CARD_TEMPLATES: Record<CardTemplateId, CardTemplate> = {
  classic_white: { id: 'classic_white', layout: 'left', background: { type: 'solid', color: '#ffffff' }, text: '#0f172a', muted: '#475569', accents: ['#2563eb', '#7c3aed', '#0f172a', '#047857'], qrTile: '#ffffff' },
  premium_black: { id: 'premium_black', layout: 'left', background: { type: 'solid', color: '#0b0f19' }, text: '#f8fafc', muted: '#94a3b8', accents: ['#d4af37', '#60a5fa', '#a78bfa', '#f8fafc'], qrTile: '#ffffff' },
  gradient: { id: 'gradient', layout: 'center', background: { type: 'gradient', from: '#2563eb', to: '#7c3aed', angle: 135 }, text: '#ffffff', muted: '#dbeafe', accents: ['#ffffff', '#fde68a', '#bbf7d0'], qrTile: '#ffffff' },
  emerald: { id: 'emerald', layout: 'band', background: { type: 'solid', color: '#f8fafc' }, text: '#0f172a', muted: '#475569', accents: ['#047857', '#0f766e', '#15803d', '#b45309'], qrTile: '#ffffff' },
  sunset: { id: 'sunset', layout: 'center', background: { type: 'gradient', from: '#f97316', to: '#db2777', angle: 135 }, text: '#ffffff', muted: '#ffedd5', accents: ['#ffffff', '#fef3c7', '#0f172a'], qrTile: '#ffffff' },
  ocean: { id: 'ocean', layout: 'left', background: { type: 'gradient', from: '#0f172a', to: '#0e7490', angle: 150 }, text: '#f8fafc', muted: '#bae6fd', accents: ['#22d3ee', '#a5f3fc', '#fde68a'], qrTile: '#ffffff' },
  sand: { id: 'sand', layout: 'band', background: { type: 'solid', color: '#f5efe6' }, text: '#292524', muted: '#57534e', accents: ['#9a3412', '#1d4ed8', '#4d7c0f', '#292524'], qrTile: '#ffffff' },
  guinea: { id: 'guinea', layout: 'band', background: { type: 'solid', color: '#ffffff' }, text: '#0f172a', muted: '#475569', accents: ['#ce1126', '#fcd116', '#009460'], qrTile: '#ffffff' },
};

export const isCardTemplateId = (v: unknown): v is CardTemplateId => typeof v === 'string' && (CARD_TEMPLATE_IDS as readonly string[]).includes(v);

export interface CardDesign {
  templateId: CardTemplateId;
  /** Une des couleurs d'accent du modèle. */
  accent: string;
  name: string;
  title: string;
  organization: string;
  /** Ligne de contact facultative (téléphone ou e-mail) imprimée au recto. */
  contact: string;
  /** Photo ou logo : adresse d'un média 1Link (`/api/media/…`) ou lien https ; vide = initiales. */
  imageUrl: string;
  imageKind: 'photo' | 'logo';
}

export const CARD_FIELD_LIMITS = { name: 40, title: 50, organization: 50, contact: 40 } as const;

/** Design par défaut d'un modèle, rempli avec ce que le profil contient déjà. */
export function defaultDesign(templateId: CardTemplateId, from: Partial<Pick<CardDesign, 'name' | 'title' | 'organization' | 'imageUrl' | 'contact'>> = {}): CardDesign {
  const t = CARD_TEMPLATES[templateId];
  return {
    templateId,
    accent: t.accents[0]!,
    name: (from.name ?? '').slice(0, CARD_FIELD_LIMITS.name),
    title: (from.title ?? '').slice(0, CARD_FIELD_LIMITS.title),
    organization: (from.organization ?? '').slice(0, CARD_FIELD_LIMITS.organization),
    contact: (from.contact ?? '').slice(0, CARD_FIELD_LIMITS.contact),
    imageUrl: from.imageUrl ?? '',
    imageKind: 'photo',
  };
}

// — Commandes —
export const CARD_ORDER_STATUSES = ['awaiting_payment', 'paid', 'validating', 'in_production', 'quality_check', 'shipped', 'delivered', 'canceled'] as const;
export type CardOrderStatus = (typeof CARD_ORDER_STATUSES)[number];

/**
 * Transitions permises. Le serveur les impose ; l'interface ne propose que celles-ci.
 * `paid` n'est atteint que par l'enregistrement d'un paiement réel (reçu par l'équipe), jamais par un simple changement de statut.
 */
export const CARD_STATUS_FLOW: Record<CardOrderStatus, readonly CardOrderStatus[]> = {
  awaiting_payment: ['canceled'],
  paid: ['validating', 'canceled'],
  validating: ['in_production', 'canceled'],
  in_production: ['quality_check', 'canceled'],
  quality_check: ['shipped', 'in_production'],
  shipped: ['delivered'],
  delivered: [],
  canceled: [],
};

export const NFC_TEST_RESULTS = ['untested', 'passed', 'failed'] as const;
export type NfcTestResult = (typeof NFC_TEST_RESULTS)[number];

export interface CardDelivery {
  fullName: string;
  phone: string;
  city: string;
  address: string;
  notes: string;
}

export interface CardNfc {
  chipId: string;
  programmedUrl: string;
  result: NfcTestResult;
  programmedAt: string | null;
}

export interface CardItem {
  id: string;
  /** Identifiant public unique : l'adresse de la carte est `<domaine>/c/<code>`. Ne change jamais. */
  code: string;
  url: string;
  kind: CardKind;
  status: 'active' | 'disabled';
  /** Qui l'a désactivée : le propriétaire peut la réactiver, pas une désactivation faite par l'équipe. */
  disabledBy: 'owner' | 'admin' | null;
  scanCount: number;
  lastScannedAt: string | null;
  nfc: CardNfc | null;
}

export interface CardOrderEvent { at: string; event: string; actor: string }

export interface CardOrder {
  id: string;
  /** Référence à indiquer lors du paiement (ex. CRT-7K2M9Q). */
  reference: string;
  status: CardOrderStatus;
  productId: CardProductId;
  kind: CardKind;
  units: number;
  cardsCount: number;
  unitPrice: number;
  total: number;
  currency: string;
  design: CardDesign;
  delivery: CardDelivery;
  /** Pseudonyme du profil associé (l'adresse des cartes, elle, ne dépend pas du pseudonyme). */
  username: string | null;
  payment: { method: string; reference: string; paidAt: string } | null;
  designApprovedAt: string | null;
  designNote: string;
  printPartner: string;
  partnerRef: string;
  shipping: { carrier: string; trackingRef: string; shippedAt: string | null; deliveredAt: string | null };
  cards: CardItem[];
  history: CardOrderEvent[];
  createdAt: string;
  updatedAt: string;
}

/** Réponse du catalogue : produits actifs et consigne de paiement définie par l'équipe (peut être vide). */
export interface CardCatalog {
  products: CardProduct[];
  paymentInstructions: string;
}

export interface CardOrderInput {
  productId: CardProductId;
  units: number;
  design: CardDesign;
  delivery: CardDelivery;
}

export const PAYMENT_METHODS_CARDS = ['mobile_money', 'bank', 'cash'] as const;
export type CardPaymentMethod = (typeof PAYMENT_METHODS_CARDS)[number];

/** Ligne de la liste d'administration. */
export interface AdminCardOrderRow {
  id: string;
  reference: string;
  customer: string;
  username: string | null;
  kind: CardKind;
  cardsCount: number;
  total: number;
  currency: string;
  status: CardOrderStatus;
  createdAt: string;
}

export interface AdminCardOrder extends CardOrder {
  customer: { id: string; name: string; email: string | null; phone: string | null };
}

/** Calcule le détail du prix : le serveur recalcule toujours, ce calcul sert à l'affichage. */
export function priceOrder(product: Pick<CardProduct, 'price' | 'quantity'>, units: number) {
  return { cardsCount: product.quantity * units, total: product.price * units };
}

/** Adresse publique d'une carte. Aucune donnée personnelle : seulement l'identifiant. */
export const cardUrl = (base: string, code: string) => `${base.replace(/\/+$/, '')}/c/${code}`;

/** Alphabet du code public : minuscules et chiffres sans caractères ambigus (0/o, 1/l/i). */
export const CARD_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const CARD_CODE_LENGTH = 10;
export const CARD_CODE_RE = /^[a-hj-km-np-z2-9]{10}$/;
