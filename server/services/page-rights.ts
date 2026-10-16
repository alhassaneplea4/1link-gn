/**
 * Droits de l'offre appliqués à un document de page (blocs, nombre de liens/services/contacts, thèmes, onglets d'apparence).
 * Le serveur est l'autorité : l'interface grise ce qui n'est pas permis, mais ne l'impose pas.
 */
import { HttpError } from '../lib/errors.js';
import { THEME_IDS, type AppearanceConfig } from '../../src/models/appearance.js';
import { allowsBlock, allowsTheme, type AppearanceTab, type PlanRights } from '../../src/models/access.js';
import { DEFAULT_APPEARANCE, THEME_PRESETS } from '../../src/models/themes.js';

type Doc = { blocks: readonly { type: string; data?: unknown }[]; appearance: AppearanceConfig };

const denied = (feature: string) => new HttpError(403, 'plan_required', { feature });

/** Champs d'apparence rattachés à chaque onglet (les onglets « Thèmes » et « Couleurs » sont ouverts à toutes les offres). */
const TAB_FIELDS: Partial<Record<AppearanceTab, (a: AppearanceConfig) => unknown>> = {
  buttons: (a) => [a.button, a.radius, a.customRadius, a.cardStyle],
  text: (a) => a.font,
  layout: (a) => a.layout,
  background: (a) => a.background,
};

/** jsonb réordonne les clés des objets : la comparaison ne dépend pas de leur ordre. */
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canon(x)])) : v);
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const itemsOf = (b: { data?: unknown }) => {
  const items = (b.data as { items?: unknown } | undefined)?.items;
  return Array.isArray(items) ? items.length : 0;
};

export function assertPageRights(rights: PlanRights, input: Doc, stored: AppearanceConfig | null) {
  let links = 0, services = 0, contacts = 0;
  for (const b of input.blocks) {
    if (!allowsBlock(rights, b.type)) throw denied(`block:${b.type}`);
    if (b.type === 'link') links++;
    if (b.type === 'service') services += itemsOf(b);
    if (b.type === 'contact') contacts += itemsOf(b);
  }
  if (rights.maxLinks !== null && links > rights.maxLinks) throw denied('links');
  if (rights.maxServices !== null && services > rights.maxServices) throw denied('services');
  if (rights.maxContacts !== null && contacts > rights.maxContacts) throw denied('contacts');

  const before = stored ?? DEFAULT_APPEARANCE;
  const after = input.appearance;
  if (after.themeId !== before.themeId && !allowsTheme(rights, after.themeId)) throw denied(`theme:${after.themeId}`);
  // Un onglet fermé à l'offre : ses réglages doivent rester ceux enregistrés, ou ceux d'un thème que l'offre autorise (appliquer un thème les réinitialise).
  const presets = THEME_IDS.filter((id) => allowsTheme(rights, id)).map((id) => THEME_PRESETS[id]);
  for (const [tab, pick] of Object.entries(TAB_FIELDS) as [AppearanceTab, (a: AppearanceConfig) => unknown][]) {
    if (rights.tabs.includes(tab)) continue;
    const next = pick(after);
    if (!same(next, pick(before)) && !presets.some((p) => same(next, pick(p)))) throw denied(`tab:${tab}`);
  }
}
