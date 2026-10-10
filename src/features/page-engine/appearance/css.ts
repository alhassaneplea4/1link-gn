import type { CSSProperties } from 'react';
import type { AppearanceConfig, FontId, RadiusKey } from '@/models/appearance';
import { mix, readableOn, withAlpha } from '@/utilities/color';

export const FONT_STACKS: Record<FontId, string> = {
  jakarta: "'Plus Jakarta Sans Variable', system-ui, sans-serif",
  manrope: "'Manrope Variable', 'Plus Jakarta Sans Variable', system-ui, sans-serif",
  fraunces: "'Fraunces Variable', Georgia, 'Times New Roman', serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

const fontLoaders: Partial<Record<FontId, () => Promise<unknown>>> = {
  manrope: () => import('@fontsource-variable/manrope'),
  fraunces: () => import('@fontsource-variable/fraunces'),
};
const loaded = new Set<FontId>();

/** Charge la police à la demande (jakarta est déjà chargée globalement ; les polices système n'ont rien à charger). */
export function loadFont(id: FontId): void {
  const load = fontLoaders[id];
  if (!load || loaded.has(id)) return;
  loaded.add(id);
  void load().catch(() => loaded.delete(id));
}

const RADII: Record<Exclude<RadiusKey, 'custom'>, number> = { sharp: 0, small: 6, medium: 12, large: 20, pill: 999 };
export const radiusToPx = (key: RadiusKey, custom: number) => (key === 'custom' ? custom : RADII[key]);

const WIDTHS = { narrow: 440, medium: 560, wide: 720 } as const;
const GAPS = { compact: 8, comfortable: 14, spacious: 22 } as const;
const PADS = { cozy: 10, comfortable: 15, airy: 21 } as const;
const SIZES = { sm: 14, md: 16, lg: 18 } as const;
const WEIGHTS = { regular: 450, medium: 560, bold: 720 } as const;

function patternImage(a: AppearanceConfig): { image: string; size: string } {
  const ink = withAlpha(a.colors.text, 0.12);
  switch (a.background.pattern) {
    case 'dots':
      return { image: `radial-gradient(${ink} 1.3px, transparent 1.4px)`, size: '22px 22px' };
    case 'grid':
      return { image: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`, size: '28px 28px' };
    case 'lines':
      return { image: `repeating-linear-gradient(135deg, ${ink} 0 1px, transparent 1px 14px)`, size: 'auto' };
    case 'waves': {
      const stroke = encodeURIComponent(withAlpha(a.colors.text, 0.14));
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='24' viewBox='0 0 80 24'><path d='M0 12 Q20 0 40 12 T80 12' fill='none' stroke='${stroke}' stroke-width='1.4'/></svg>`;
      return { image: `url("data:image/svg+xml,${svg.replace(/#/g, '%23')}")`, size: '80px 24px' };
    }
  }
}

/** Convertit une configuration d'apparence en variables CSS (--pg-*) consommées par le rendu de page. */
export function appearanceToStyle(a: AppearanceConfig): CSSProperties {
  const { colors, background, layout, font } = a;
  const onPrimary = readableOn(colors.primary);
  const onGradient = readableOn(mix(colors.primary, colors.accent, 0.5));
  let bg: CSSProperties = { background: colors.background };
  if (background.type === 'gradient') {
    bg = { background: `linear-gradient(${background.gradient.angle}deg, ${background.gradient.from}, ${background.gradient.to})` };
  } else if (background.type === 'image' && background.imageUrl) {
    const o = Math.max(0, Math.min(0.8, background.overlay));
    bg = {
      backgroundColor: colors.background,
      backgroundImage: `linear-gradient(rgb(0 0 0 / ${o}), rgb(0 0 0 / ${o})), url("${background.imageUrl.replace(/"/g, '%22')}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  } else if (background.type === 'pattern') {
    const p = patternImage(a);
    bg = { backgroundColor: colors.background, backgroundImage: p.image, backgroundSize: p.size };
  }
  return {
    ...bg,
    '--pg-primary': colors.primary,
    '--pg-on-primary': onPrimary,
    '--pg-on-gradient': onGradient,
    '--pg-accent': colors.accent,
    '--pg-text': colors.text,
    '--pg-muted': colors.textMuted,
    '--pg-bg': colors.background,
    '--pg-surface': colors.surface,
    '--pg-border': colors.border,
    '--pg-radius': `${radiusToPx(a.radius, a.customRadius)}px`,
    '--pg-btn-radius': `${radiusToPx(a.button.radius, a.button.customRadius)}px`,
    '--pg-font': FONT_STACKS[font.family],
    '--pg-font-size': `${SIZES[font.size]}px`,
    '--pg-font-weight': WEIGHTS[font.weight],
    '--pg-width': `${WIDTHS[layout.width]}px`,
    '--pg-gap': `${GAPS[layout.spacing]}px`,
    '--pg-pad': `${PADS[layout.density]}px`,
    '--pg-glass-tint': withAlpha(colors.surface, 0.14),
    '--pg-soft': withAlpha(colors.primary, 0.12),
    '--pg-shadow': withAlpha(colors.text, 0.16),
  } as CSSProperties;
}

export function appearanceDataAttrs(a: AppearanceConfig) {
  return {
    'data-btn': a.button.style,
    'data-card': a.cardStyle,
    'data-align': a.layout.align,
    'data-profile': a.layout.profilePosition,
    'data-links': a.layout.linkLayout,
    'data-cols': String(a.layout.columns),
    'data-bg': a.background.type,
  } as const;
}
