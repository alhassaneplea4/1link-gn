import type { AppearanceConfig, ThemeId } from './appearance';

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  themeId: 'minimal',
  colors: {
    primary: '#111827',
    accent: '#2563eb',
    text: '#111827',
    textMuted: '#4b5563',
    background: '#ffffff',
    surface: '#ffffff',
    border: '#e5e7eb',
  },
  button: { style: 'filled', radius: 'medium', customRadius: 14 },
  radius: 'medium',
  customRadius: 14,
  font: { family: 'jakarta', size: 'md', weight: 'medium' },
  layout: { width: 'medium', align: 'center', spacing: 'comfortable', density: 'comfortable', profilePosition: 'top', linkLayout: 'stack', columns: 1 },
  background: { type: 'solid', gradient: { from: '#2563eb', to: '#7c3aed', angle: 160 }, imageUrl: '', overlay: 0.35, pattern: 'dots' },
  cardStyle: 'minimal',
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    const cur = (base as Record<string, unknown>)[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' ? merge(cur as object, v as object) : v;
  }
  return out as T;
}

export const mergeAppearance = (base: AppearanceConfig, patch: DeepPartial<AppearanceConfig>): AppearanceConfig => merge(base, patch);

const preset = (id: ThemeId, patch: DeepPartial<AppearanceConfig>): AppearanceConfig =>
  merge(DEFAULT_APPEARANCE, { ...patch, themeId: id });

/** Thèmes prédéfinis. Ajouter un thème = ajouter une entrée (+ sa clé de libellé) ici. */
export const THEME_PRESETS: Record<ThemeId, AppearanceConfig> = {
  minimal: preset('minimal', {}),
  professional: preset('professional', {
    colors: { primary: '#2563eb', accent: '#1e40af', text: '#0f172a', textMuted: '#475569', background: '#f3f4f6', surface: '#ffffff', border: '#d9dee7' },
    button: { style: 'filled', radius: 'small' }, radius: 'small', cardStyle: 'card', font: { family: 'manrope', weight: 'medium' },
  }),
  creator: preset('creator', {
    colors: { primary: '#ffffff', accent: '#f0abfc', text: '#ffffff', textMuted: '#e4defc', background: '#4f46e5', surface: '#ffffff', border: '#ffffff' },
    background: { type: 'gradient', gradient: { from: '#4338ca', to: '#9333ea', angle: 160 } },
    button: { style: 'glass', radius: 'pill' }, radius: 'large', cardStyle: 'glass', font: { family: 'jakarta', weight: 'bold' },
  }),
  elegant: preset('elegant', {
    colors: { primary: '#7a4f24', accent: '#a47148', text: '#2b2118', textMuted: '#5f5143', background: '#faf6ef', surface: '#fffdf9', border: '#e6dccb' },
    button: { style: 'outline', radius: 'small' }, radius: 'small', cardStyle: 'minimal', font: { family: 'fraunces', weight: 'regular' },
  }),
  modern: preset('modern', {
    colors: { primary: '#2563eb', accent: '#7c3aed', text: '#0f172a', textMuted: '#475569', background: '#f8fafc', surface: '#ffffff', border: '#e2e8f0' },
    button: { style: 'gradient', radius: 'large' }, radius: 'large', cardStyle: 'floating', font: { family: 'jakarta', weight: 'bold' },
  }),
  dark: preset('dark', {
    colors: { primary: '#8fadf8', accent: '#a78bfa', text: '#f3f4f6', textMuted: '#aab4c8', background: '#0b0f1a', surface: '#151c2f', border: '#28324b' },
    button: { style: 'filled', radius: 'medium' }, cardStyle: 'card', font: { family: 'jakarta', weight: 'medium' },
  }),
  soft: preset('soft', {
    colors: { primary: '#7c3aed', accent: '#db2777', text: '#2e2347', textMuted: '#5e5378', background: '#f6f2ff', surface: '#ffffff', border: '#e7defa' },
    button: { style: 'soft', radius: 'pill' }, radius: 'large', cardStyle: 'flat', font: { family: 'manrope', weight: 'medium' },
  }),
  business: preset('business', {
    colors: { primary: '#0b3b8c', accent: '#0e7490', text: '#0b1b33', textMuted: '#4b5a70', background: '#ffffff', surface: '#f5f7fb', border: '#d8e0ee' },
    button: { style: 'filled', radius: 'small' }, radius: 'small', cardStyle: 'card', font: { family: 'manrope', weight: 'medium' },
    layout: { align: 'left', profilePosition: 'left', width: 'wide', linkLayout: 'stack' },
  }),
  creative: preset('creative', {
    colors: { primary: '#c2410c', accent: '#db2777', text: '#3b1d0e', textMuted: '#6b4531', background: '#fff7e6', surface: '#ffffff', border: '#f2d9a8' },
    background: { type: 'pattern', pattern: 'dots' },
    button: { style: 'outline', radius: 'custom', customRadius: 22 }, radius: 'custom', customRadius: 22, cardStyle: 'floating', font: { family: 'fraunces', weight: 'bold' },
  }),
  custom: preset('custom', {
    colors: { primary: '#2563eb', accent: '#7c3aed', text: '#111827', textMuted: '#4b5563', background: '#ffffff', surface: '#ffffff', border: '#e5e7eb' },
    button: { style: 'gradient', radius: 'pill' },
  }),
};

export const themeOrder: ThemeId[] = ['minimal', 'professional', 'creator', 'elegant', 'modern', 'dark', 'soft', 'business', 'creative', 'custom'];

export const getThemePreset = (id: ThemeId): AppearanceConfig => structuredClone(THEME_PRESETS[id]);
