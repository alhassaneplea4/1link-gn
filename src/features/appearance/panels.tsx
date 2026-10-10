import { useRef, useState } from 'react';
import { Alert, Button, Icon, Input, Segmented, Select, useToast } from '@/components/ui';
import { getThemePreset, themeOrder } from '@/features/page-engine/appearance/themes';
import { useT } from '@/i18n/core';
import { uploadImage } from '@/services/media';
import { useEditor } from '@/state/editor';
import { BACKGROUND_TYPES, BUTTON_STYLES, CARD_STYLES, FONT_IDS, PATTERNS, RADIUS_KEYS, type AppearanceConfig, type ColorKey } from '@/models/appearance';
import { COLOR_KEYS } from '@/models/appearance';
import { readableOn } from '@/utilities/color';
import { ColorField, ContrastRow, Group, RangeField } from './controls';

type Patch = (p: Parameters<ReturnType<typeof useEditor.getState>['patchAppearance']>[0], key?: string) => void;
interface PanelProps { a: AppearanceConfig; patch: Patch }

export function ThemesPanel({ a }: Pick<PanelProps, 'a'>) {
  const t = useT('appearance', 'common');
  const apply = useEditor((s) => s.applyTheme);
  return (
    <ul role="list" className="themegrid">
      {themeOrder.map((id) => {
        const p = getThemePreset(id);
        const bg = p.background.type === 'gradient' ? `linear-gradient(${p.background.gradient.angle}deg, ${p.background.gradient.from}, ${p.background.gradient.to})` : p.colors.background;
        const active = a.themeId === id;
        return (
          <li key={id}>
            <button type="button" className={`themecard ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => apply(id)}>
              <span className="themecard__preview" style={{ background: bg, borderColor: p.colors.border }} aria-hidden="true">
                <i className="themecard__avatar" style={{ background: p.colors.primary }} />
                <i className="themecard__line" style={{ background: p.colors.text }} />
                <i className="themecard__btn" style={{ background: p.button.style === 'outline' ? 'transparent' : p.colors.primary, border: `1.5px solid ${p.colors.primary}`, borderRadius: p.button.radius === 'pill' ? 99 : p.button.radius === 'sharp' ? 0 : 6 }} />
                <i className="themecard__btn" style={{ background: p.button.style === 'outline' ? 'transparent' : p.colors.primary, opacity: 0.55, border: `1.5px solid ${p.colors.primary}`, borderRadius: p.button.radius === 'pill' ? 99 : p.button.radius === 'sharp' ? 0 : 6 }} />
              </span>
              <span className="themecard__name">{active && <Icon name="check-circle" size={14} />}{t(`common.themes.${id}`)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const QUICK = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#111827', '#475569'];

export function ColorsPanel({ a, patch }: PanelProps) {
  const t = useT('appearance');
  const labels: Record<ColorKey, string> = {
    primary: t('appearance.colors.primary'), accent: t('appearance.colors.accent'), text: t('appearance.colors.text'), textMuted: t('appearance.colors.textMuted'),
    background: t('appearance.colors.background'), surface: t('appearance.colors.surface'), border: t('appearance.colors.border'),
  };
  const c = a.colors;
  return (
    <div className="panel">
      <Group title={t('appearance.colors.quick')} hint={t('appearance.colors.quickHint')}>
        <div className="swatches" role="group" aria-label={t('appearance.colors.quick')}>
          {QUICK.map((q) => (
            <button key={q} type="button" className={`swatch ${c.primary === q ? 'is-active' : ''}`} style={{ background: q }} aria-label={q} aria-pressed={c.primary === q} onClick={() => patch({ colors: { primary: q } }, 'color:primary')} />
          ))}
        </div>
      </Group>
      <Group title={t('appearance.colors.title')}>
        <div className="colorgrid">
          {COLOR_KEYS.map((k) => <ColorField key={k} label={labels[k]} value={c[k]} onChange={(v) => patch({ colors: { [k]: v } }, `color:${k}`)} />)}
        </div>
      </Group>
      <Group title={t('appearance.contrast.title')} hint={t('appearance.contrast.hint')}>
        <ul role="list" className="contrasts">
          <ContrastRow label={t('appearance.contrast.textBg')} fg={c.text} bg={c.background} />
          <ContrastRow label={t('appearance.contrast.mutedBg')} fg={c.textMuted} bg={c.background} />
          <ContrastRow label={t('appearance.contrast.textSurface')} fg={c.text} bg={c.surface} />
          <ContrastRow label={t('appearance.contrast.buttonLabel')} fg={readableOn(c.primary)} bg={c.primary} />
          <ContrastRow label={t('appearance.contrast.accentBg')} fg={c.accent} bg={c.background} large />
        </ul>
      </Group>
    </div>
  );
}

export function ButtonsPanel({ a, patch }: PanelProps) {
  const t = useT('appearance');
  return (
    <div className="panel">
      <Group title={t('appearance.buttons.style')}>
        <Segmented label={t('appearance.buttons.style')} value={a.button.style} onChange={(v) => patch({ button: { style: v } })} options={BUTTON_STYLES.map((s) => ({ value: s, label: t(`appearance.buttons.styles.${s}`) }))} />
      </Group>
      <Group title={t('appearance.buttons.radius')}>
        <Segmented label={t('appearance.buttons.radius')} value={a.button.radius} onChange={(v) => patch({ button: { radius: v } })} options={RADIUS_KEYS.map((r) => ({ value: r, label: t(`appearance.radius.${r}`) }))} />
        {a.button.radius === 'custom' && <RangeField label={t('appearance.radius.customValue')} value={a.button.customRadius} min={0} max={40} unit=" px" onChange={(v) => patch({ button: { customRadius: v } }, 'btn-radius')} />}
      </Group>
      <Group title={t('appearance.cards.style')}>
        <Segmented label={t('appearance.cards.style')} value={a.cardStyle} onChange={(v) => patch({ cardStyle: v })} options={CARD_STYLES.map((s) => ({ value: s, label: t(`appearance.cards.styles.${s}`) }))} />
      </Group>
      <Group title={t('appearance.cards.radius')}>
        <Segmented label={t('appearance.cards.radius')} value={a.radius} onChange={(v) => patch({ radius: v })} options={RADIUS_KEYS.map((r) => ({ value: r, label: t(`appearance.radius.${r}`) }))} />
        {a.radius === 'custom' && <RangeField label={t('appearance.radius.customValue')} value={a.customRadius} min={0} max={40} unit=" px" onChange={(v) => patch({ customRadius: v }, 'card-radius')} />}
      </Group>
    </div>
  );
}

export function TypographyPanel({ a, patch }: PanelProps) {
  const t = useT('appearance');
  return (
    <div className="panel">
      <Group title={t('appearance.type.family')}>
        <Select label={t('appearance.type.family')} value={a.font.family} onChange={(e) => patch({ font: { family: e.target.value as AppearanceConfig['font']['family'] } })}>
          {FONT_IDS.map((f) => <option key={f} value={f}>{t(`appearance.type.families.${f}`)}</option>)}
        </Select>
      </Group>
      <Group title={t('appearance.type.size')}>
        <Segmented label={t('appearance.type.size')} value={a.font.size} onChange={(v) => patch({ font: { size: v } })} options={(['sm', 'md', 'lg'] as const).map((s) => ({ value: s, label: t(`appearance.type.sizes.${s}`) }))} />
      </Group>
      <Group title={t('appearance.type.weight')}>
        <Segmented label={t('appearance.type.weight')} value={a.font.weight} onChange={(v) => patch({ font: { weight: v } })} options={(['regular', 'medium', 'bold'] as const).map((s) => ({ value: s, label: t(`appearance.type.weights.${s}`) }))} />
      </Group>
    </div>
  );
}

export function LayoutPanel({ a, patch }: PanelProps) {
  const t = useT('appearance');
  const L = a.layout;
  const seg = <K extends keyof AppearanceConfig['layout']>(key: K, opts: readonly AppearanceConfig['layout'][K][]) => (
    <Segmented label={t(`appearance.layout.${key}`)} value={String(L[key]) as never} onChange={(v) => patch({ layout: { [key]: key === 'columns' ? Number(v) : v } } as never)} options={opts.map((o) => ({ value: String(o) as never, label: t(`appearance.layout.opts.${key}.${o}` as never) }))} />
  );
  return (
    <div className="panel">
      <Group title={t('appearance.layout.width')}>{seg('width', ['narrow', 'medium', 'wide'])}</Group>
      <Group title={t('appearance.layout.align')}>{seg('align', ['left', 'center'])}</Group>
      <Group title={t('appearance.layout.profilePosition')}>{seg('profilePosition', ['top', 'left', 'cover'])}</Group>
      <Group title={t('appearance.layout.spacing')}>{seg('spacing', ['compact', 'comfortable', 'spacious'])}</Group>
      <Group title={t('appearance.layout.density')}>{seg('density', ['cozy', 'comfortable', 'airy'])}</Group>
      <Group title={t('appearance.layout.linkLayout')}>{seg('linkLayout', ['stack', 'grid'])}</Group>
      {L.linkLayout === 'grid' && <Group title={t('appearance.layout.columns')} hint={t('appearance.layout.columnsHint')}>{seg('columns', [1, 2])}</Group>}
    </div>
  );
}

export function BackgroundPanel({ a, patch }: PanelProps) {
  const t = useT('appearance', 'editor');
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const bg = a.background;
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      patch({ background: { type: 'image', imageUrl: await uploadImage(f) } });
    } catch {
      toast.push({ tone: 'error', title: t('editor.form.uploadError') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel">
      <Group title={t('appearance.background.type')}>
        <Segmented label={t('appearance.background.type')} value={bg.type} onChange={(v) => patch({ background: { type: v } })} options={BACKGROUND_TYPES.map((s) => ({ value: s, label: t(`appearance.background.types.${s}`) }))} />
      </Group>
      {bg.type === 'solid' && <ColorField label={t('appearance.colors.background')} value={a.colors.background} onChange={(v) => patch({ colors: { background: v } }, 'color:background')} />}
      {bg.type === 'gradient' && (
        <Group title={t('appearance.background.gradient')}>
          <div className="colorgrid">
            <ColorField label={t('appearance.background.from')} value={bg.gradient.from} onChange={(v) => patch({ background: { gradient: { from: v } } }, 'grad-from')} />
            <ColorField label={t('appearance.background.to')} value={bg.gradient.to} onChange={(v) => patch({ background: { gradient: { to: v } } }, 'grad-to')} />
          </div>
          <RangeField label={t('appearance.background.angle')} value={bg.gradient.angle} min={0} max={360} unit="°" onChange={(v) => patch({ background: { gradient: { angle: v } } }, 'grad-angle')} />
          <Alert tone="info">{t('appearance.background.textHint')}</Alert>
        </Group>
      )}
      {bg.type === 'image' && (
        <Group title={t('appearance.background.image')}>
          <Input label={t('appearance.background.imageUrl')} placeholder="https://" value={bg.imageUrl.startsWith('data:') ? t('editor.form.imageUploaded') : bg.imageUrl} readOnly={bg.imageUrl.startsWith('data:')} onChange={(e) => patch({ background: { imageUrl: e.target.value } }, 'bg-image')} />
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          <div className="agroup__row"><Button size="sm" variant="secondary" iconLeft="upload" loading={busy} onClick={() => file.current?.click()}>{t('editor.form.chooseFile')}</Button>{bg.imageUrl && <Button size="sm" variant="ghost" iconLeft="x" onClick={() => patch({ background: { imageUrl: '' } })}>{t('editor.form.removeImage')}</Button>}</div>
          <RangeField label={t('appearance.background.overlay')} value={Math.round(bg.overlay * 100)} min={0} max={80} unit=" %" onChange={(v) => patch({ background: { overlay: v / 100 } }, 'bg-overlay')} />
          <Alert tone="info">{t('appearance.background.textHint')}</Alert>
        </Group>
      )}
      {bg.type === 'pattern' && (
        <Group title={t('appearance.background.pattern')}>
          <Segmented label={t('appearance.background.pattern')} value={bg.pattern} onChange={(v) => patch({ background: { pattern: v } })} options={PATTERNS.map((p) => ({ value: p, label: t(`appearance.background.patterns.${p}`) }))} />
          <ColorField label={t('appearance.colors.background')} value={a.colors.background} onChange={(v) => patch({ colors: { background: v } }, 'color:background')} />
        </Group>
      )}
    </div>
  );
}
