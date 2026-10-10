import { useEffect, useId, useState, type ReactNode } from 'react';
import { Badge, Icon } from '@/components/ui';
import { useT } from '@/i18n/core';
import { contrastLevel, contrastRatio, isHex, normalizeHex } from '@/utilities/color';

/** Champ couleur : sélecteur natif + saisie HEX validée (la valeur n'est appliquée que si elle est valide). */
export function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (hex: string) => void; hint?: string }) {
  const t = useT('appearance');
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const invalid = text !== '' && !isHex(text) && !isHex(`#${text}`);
  return (
    <div className="colorfield">
      <label htmlFor={id} className="field__label">{label}</label>
      <div className={`colorfield__row ${invalid ? 'is-invalid' : ''}`}>
        <input type="color" aria-label={`${label} — ${t('appearance.colors.picker')}`} className="colorfield__picker" value={normalizeHex(value) ?? '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input
          id={id} className="colorfield__hex mono" value={text} maxLength={7} spellCheck={false} autoComplete="off" aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-e` : hint ? `${id}-h` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = normalizeHex(e.target.value);
            if (n && (e.target.value.length === 7 || e.target.value.length === 4 || e.target.value.length === 6)) onChange(n);
          }}
          onBlur={() => setText(normalizeHex(text) ?? value)}
        />
      </div>
      {invalid && <p id={`${id}-e`} className="field__error" role="alert"><Icon name="alert-circle" size={14} /> {t('appearance.colors.invalidHex')}</p>}
      {hint && !invalid && <p id={`${id}-h`} className="field__hint">{hint}</p>}
    </div>
  );
}

/** Validation de contraste WCAG avec libellé texte + icône (jamais la couleur seule). */
export function ContrastRow({ label, fg, bg, large }: { label: string; fg: string; bg: string; large?: boolean }) {
  const t = useT('appearance');
  const ratio = contrastRatio(fg, bg);
  const level = contrastLevel(ratio);
  const ok = large ? ratio >= 3 : ratio >= 4.5;
  return (
    <li className="contrast">
      <span className="contrast__sample" style={{ background: bg, color: fg }} aria-hidden="true">Aa</span>
      <span className="contrast__label">{label}</span>
      <span className="contrast__ratio mono">{ratio.toFixed(1)}:1</span>
      <Badge tone={ok ? (level === 'AAA' ? 'success' : 'success') : 'danger'} icon={ok ? 'check' : 'alert'}>
        {level === 'AAA' ? 'AAA' : ok ? 'AA' : level === 'AA-large' ? t('appearance.contrast.largeOnly') : t('appearance.contrast.fail')}
      </Badge>
    </li>
  );
}

export function RangeField({ label, value, min, max, step = 1, unit = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="rangefield">
      <label htmlFor={id} className="field__label">{label} <output className="mono subtle">{value}{unit}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="agroup">
      <h3>{title}</h3>
      {hint && <p className="field__hint">{hint}</p>}
      <div className="agroup__body">{children}</div>
    </section>
  );
}
