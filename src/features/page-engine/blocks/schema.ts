/**
 * Schéma déclaratif des champs d'un bloc.
 * Le formulaire d'édition ET la validation sont générés depuis ce schéma : ajouter un type de bloc
 * ne demande ni nouveau formulaire ni nouvelle logique de validation.
 */
import { isEmail, isLink, isPhone, isUrl } from '@/utilities/validation';
import { isBareBase } from '@/models/platforms';
import { parsePrice } from './money';

const MEDIA_PATH = /^\/api\/media\/med_[a-f0-9]{20}$/;

export type ScalarKind = 'text' | 'textarea' | 'url' | 'email' | 'tel' | 'image' | 'number';

export interface ScalarField {
  kind: ScalarKind;
  name: string;
  required?: boolean;
  max?: number;
  placeholder?: string;
}
export interface SelectField { kind: 'select'; name: string; options: readonly string[]; required?: boolean }
export interface ToggleField { kind: 'toggle'; name: string }
/** Choix d'une plateforme par recherche (nom + logo) ; `allowLink` ajoute « Lien générique ». */
export interface PlatformField { kind: 'platform'; name: string; allowLink?: boolean }
export interface ListField {
  kind: 'list';
  name: string;
  itemFields: readonly FieldDef[];
  defaultItem: Record<string, unknown>;
  max: number;
}
export type FieldDef = ScalarField | SelectField | ToggleField | ListField | PlatformField;

export type ErrorKey = 'common.validation.required' | 'common.validation.email' | 'common.validation.url' | 'common.validation.phone' | 'common.validation.tooLong' | 'common.validation.number' | 'common.validation.schedule' | 'common.validation.sameCurrency' | 'common.validation.rate' | 'common.validation.profileMissing';
export type FieldErrors = Record<string, ErrorKey>;

function validateScalar(f: ScalarField | SelectField, value: unknown, siblings: Record<string, unknown> = {}): ErrorKey | null {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return f.required ? 'common.validation.required' : null;
  if (f.kind === 'select') return null;
  if (f.max && v.length > f.max) return 'common.validation.tooLong';
  if (f.kind === 'url') {
    if (!isLink(v)) return 'common.validation.url';
    // Réseau choisi mais adresse laissée à l'adresse officielle : il manque le nom d'utilisateur.
    const platform = typeof siblings.platform === 'string' ? siblings.platform : '';
    return platform && platform !== 'link' && isBareBase(platform, v) ? 'common.validation.profileMissing' : null;
  }
  // Image : adresse https ou image téléversée sur le serveur (/api/media/<id>) ; jamais d'URL de données.
  if (f.kind === 'image') return isUrl(v) || MEDIA_PATH.test(v) ? null : 'common.validation.url';
  if (f.kind === 'email') return isEmail(v) ? null : 'common.validation.email';
  if (f.kind === 'number') return parsePrice(v) === null ? 'common.validation.number' : null;
  if (f.kind === 'tel') return isPhone(v) ? null : 'common.validation.phone';
  return null;
}

/** Valide `data` selon `fields`. Les clés d'erreur sont des chemins : `title`, `items.2.url`. */
export function validateFields(fields: readonly FieldDef[], data: Record<string, unknown>, prefix = ''): FieldErrors {
  const errors: FieldErrors = {};
  for (const f of fields) {
    const path = `${prefix}${f.name}`;
    if (f.kind === 'toggle' || f.kind === 'platform') continue;
    if (f.kind === 'list') {
      const items = Array.isArray(data[f.name]) ? (data[f.name] as Record<string, unknown>[]) : [];
      items.forEach((item, i) => Object.assign(errors, validateFields(f.itemFields, item, `${path}.${i}.`)));
      continue;
    }
    const err = validateScalar(f, data[f.name], data);
    if (err) errors[path] = err;
  }
  return errors;
}
