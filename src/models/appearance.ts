/** Configuration d'apparence : structurée, typée et indépendante du contenu. */

export const THEME_IDS = ['minimal', 'professional', 'creator', 'elegant', 'modern', 'dark', 'soft', 'business', 'creative', 'custom'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const BUTTON_STYLES = ['filled', 'outline', 'soft', 'ghost', 'gradient', 'glass'] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

export const RADIUS_KEYS = ['sharp', 'small', 'medium', 'large', 'pill', 'custom'] as const;
export type RadiusKey = (typeof RADIUS_KEYS)[number];

export const CARD_STYLES = ['minimal', 'card', 'glass', 'floating', 'flat'] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const FONT_IDS = ['jakarta', 'manrope', 'fraunces', 'system', 'mono'] as const;
export type FontId = (typeof FONT_IDS)[number];

export const BACKGROUND_TYPES = ['solid', 'gradient', 'image', 'pattern'] as const;
export type BackgroundType = (typeof BACKGROUND_TYPES)[number];

export const PATTERNS = ['dots', 'grid', 'lines', 'waves'] as const;
export type PatternId = (typeof PATTERNS)[number];

export interface ColorSet {
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  background: string;
  surface: string;
  border: string;
}

export interface AppearanceConfig {
  themeId: ThemeId;
  colors: ColorSet;
  button: { style: ButtonStyle; radius: RadiusKey; customRadius: number };
  /** Arrondi des cartes et de l'avatar. */
  radius: RadiusKey;
  customRadius: number;
  font: { family: FontId; size: 'sm' | 'md' | 'lg'; weight: 'regular' | 'medium' | 'bold' };
  layout: {
    width: 'narrow' | 'medium' | 'wide';
    align: 'left' | 'center';
    spacing: 'compact' | 'comfortable' | 'spacious';
    density: 'cozy' | 'comfortable' | 'airy';
    profilePosition: 'top' | 'left' | 'cover';
    linkLayout: 'stack' | 'grid';
    columns: 1 | 2;
  };
  background: {
    type: BackgroundType;
    gradient: { from: string; to: string; angle: number };
    imageUrl: string;
    overlay: number; // 0..0.8
    pattern: PatternId;
  };
  cardStyle: CardStyle;
}

export type ColorKey = keyof ColorSet;
export const COLOR_KEYS: readonly ColorKey[] = ['primary', 'accent', 'text', 'textMuted', 'background', 'surface', 'border'];
