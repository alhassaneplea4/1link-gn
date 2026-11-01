/** Validation (zod) des entrées 1Link Cards. Le serveur ne fait confiance ni aux prix, ni aux statuts, ni aux couleurs envoyés par le client. */
import { z } from 'zod';
import { CARD_FIELD_LIMITS, CARD_PRODUCT_IDS, CARD_TEMPLATES, CARD_TEMPLATE_IDS, MAX_UNITS_PER_LINE, NFC_TEST_RESULTS, PAYMENT_METHODS_CARDS, type CardDesign } from '../../src/models/cards.js';
import { isPhone } from '../../src/utilities/validation.js';

const MEDIA_PATH = /^\/api\/media\/med_[a-f0-9]{20}$/;
const text = (max: number) => z.string().trim().max(max).default('');

export const designSchema = z
  .object({
    templateId: z.enum(CARD_TEMPLATE_IDS),
    accent: z.string().trim().max(9),
    name: text(CARD_FIELD_LIMITS.name),
    title: text(CARD_FIELD_LIMITS.title),
    organization: text(CARD_FIELD_LIMITS.organization),
    contact: text(CARD_FIELD_LIMITS.contact),
    imageUrl: z
      .string()
      .trim()
      .max(2048)
      .default('')
      // Uniquement une image téléversée sur 1Link : l'imprimeur la reçoit intégrée au fichier d'impression.
      .refine((v) => v === '' || MEDIA_PATH.test(v), 'url'),
    imageKind: z.enum(['photo', 'logo']).default('photo'),
  })
  .superRefine((d, ctx) => {
    if (!d.name) ctx.addIssue({ code: 'custom', path: ['name'], message: 'required' });
    // Personnalisation limitée au design : l'accent doit faire partie des couleurs prévues pour ce modèle.
    if (!CARD_TEMPLATES[d.templateId].accents.includes(d.accent)) ctx.addIssue({ code: 'custom', path: ['accent'], message: 'invalid' });
  }) satisfies z.ZodType<CardDesign, unknown>;

export const deliverySchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).refine(isPhone, 'phone'),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().min(3).max(200),
  notes: text(300),
});

export const orderSchema = z.object({
  productId: z.enum(CARD_PRODUCT_IDS),
  units: z.number().int().min(1).max(MAX_UNITS_PER_LINE),
  design: designSchema,
  delivery: deliverySchema,
});

export const paymentSchema = z.object({ method: z.enum(PAYMENT_METHODS_CARDS), reference: z.string().trim().min(1).max(80) });
export const reviewSchema = z.object({ approved: z.boolean(), note: z.string().trim().max(300).default('') });
export const productionSchema = z.object({ printPartner: z.string().trim().max(80), partnerRef: z.string().trim().max(80).default('') });
export const statusSchema = z.object({
  status: z.enum(['validating', 'in_production', 'quality_check', 'shipped', 'delivered', 'canceled']),
  note: z.string().trim().max(300).default(''),
  carrier: z.string().trim().max(60).default(''),
  trackingRef: z.string().trim().max(80).default(''),
});
export const nfcSchema = z.object({
  chipId: z.string().trim().max(60).default(''),
  programmedUrl: z.string().trim().max(300).default(''),
  result: z.enum(NFC_TEST_RESULTS),
});
export const productPatchSchema = z.object({ price: z.number().int().min(0).max(100_000_000).optional(), active: z.boolean().optional() });
export const settingsSchema = z.object({ paymentInstructions: z.string().trim().max(800) });
