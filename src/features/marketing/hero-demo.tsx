import { useMemo, useState } from 'react';
import { Badge, Icon, IconButton, LinkButton, Segmented } from '@/components/ui';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { QrCode } from '@/features/page-engine/blocks/render/places';
import { blockRegistry, blockSummary } from '@/features/page-engine/blocks/registry';
import { getThemePreset, mergeAppearance, themeOrder } from '@/features/page-engine/appearance/themes';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { getSampleDocument, makeDoc } from '@/features/page-engine/samples';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import type { AnyBlock } from '@/models/blocks';
import type { ButtonStyle, RadiusKey, ThemeId } from '@/models/appearance';
import { move } from '@/utilities/misc';

const SAMPLE_URL = 'https://1link.gn/mariama';

export function Hero() {
  const t = useT('marketing');
  const doc = useMemo(() => getSampleDocument('creator'), []);
  const [lead, ...rest] = t('marketing.hero.title').split(', ');
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__bg" aria-hidden="true" />
      <div className="container container--xl hero__grid">
        <div className="hero__copy">
          <Badge tone="violet" icon="sparkles" className="hero__eyebrow">{t('marketing.hero.eyebrow')}</Badge>
          <h1 id="hero-title" className="hero__title">
            {rest.length ? <>{lead}, <span className="text-gradient">{rest.join(', ')}</span></> : t('marketing.hero.title')}
          </h1>
          <p className="hero__sub">{t('marketing.hero.subtitle')}</p>
          <div className="hero__cta">
            <LinkButton to={paths.register} variant="gradient" size="lg" iconRight="arrow-right">{t('marketing.hero.cta')}</LinkButton>
            <LinkButton to="/#demo" variant="secondary" size="lg">{t('marketing.hero.secondary')}</LinkButton>
          </div>
          <p className="hero__note"><Icon name="check-circle" size={16} /> {t('marketing.hero.note')}</p>
        </div>
        <div className="hero__visual">
          <div className="hero__halo" aria-hidden="true" />
          <PhoneFrame decorative label={t('marketing.hero.fictional')} tilt className="hero__phone">
            <PageRenderer page={doc} pageUrl={SAMPLE_URL} preview layout="profile" />
          </PhoneFrame>
          <div className="floatcard floatcard--click" aria-hidden="true">
            <span className="floatcard__icon"><Icon name="click" size={18} /></span>
            <div><strong>{t('marketing.hero.cardClickTitle')}</strong><small>{t('marketing.hero.cardClickText')}</small></div>
          </div>
          <div className="floatcard floatcard--qr" aria-hidden="true">
            <QrCode value={SAMPLE_URL} size={72} />
            <small>{t('marketing.hero.cardQr')}</small>
          </div>
          <div className="floatcard floatcard--contact" aria-hidden="true">
            <span className="floatcard__icon floatcard__icon--green"><Icon name="whatsapp" size={18} /></span>
            <strong>{t('marketing.hero.cardContact')}</strong>
          </div>
          <p className="hero__caption">{t('marketing.hero.illustrative')}</p>
        </div>
      </div>
      <div className="container container--xl">
        <div className="trust-strip reveal" aria-label={t('marketing.trust.label')}>
          <div className="trust-strip__item">
            <span aria-hidden="true">🇬🇳</span>
            <span>{t('marketing.trust.guinea')}</span>
          </div>
          <span className="trust-strip__dot" aria-hidden="true" />
          <div className="trust-strip__item">
            <Icon name="whatsapp" size={16} className="trust-strip__whatsapp" />
            <span>{t('marketing.trust.whatsapp')}</span>
          </div>
          <span className="trust-strip__dot" aria-hidden="true" />
          <div className="trust-strip__item">
            <Icon name="zap" size={16} className="trust-strip__lite" />
            <span>{t('marketing.trust.lite')}</span>
          </div>
          <span className="trust-strip__dot" aria-hidden="true" />
          <div className="trust-strip__item">
            <Icon name="shield-check" size={16} className="trust-strip__shield" />
            <span>{t('marketing.trust.zeroCommission')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Mini-éditeur interactif : les blocs de la page exemple peuvent être masqués et réordonnés. */
export function DemoSection() {
  const t = useT('marketing', 'editor');
  const base = useMemo(() => {
    const pro = getSampleDocument('professional');
    const social = getSampleDocument('creator').blocks.find((b) => b.type === 'social')!;
    const qr: AnyBlock = { id: 'demo-qr', type: 'qr', visible: true, data: { label: '', target: 'page', url: '' } };
    return makeDoc({ ...pro, blocks: [pro.blocks[0]!, social, ...pro.blocks.slice(1), qr] });
  }, []);
  const [blocks, setBlocks] = useState<AnyBlock[]>(base.blocks);
  const doc = useMemo(() => ({ ...base, blocks }), [base, blocks]);
  return (
    <section className="section" id="demo" aria-labelledby="demo-title">
      <div className="container container--xl demo">
        <div className="demo__copy reveal">
          <p className="eyebrow">{t('marketing.demo.eyebrow')}</p>
          <h2 id="demo-title" className="section__title">{t('marketing.demo.title')}</h2>
          <p className="section__sub">{t('marketing.demo.subtitle')}</p>
          <ol role="list" className="demo__list" aria-label={t('marketing.demo.listLabel')}>
            {blocks.map((b, i) => (
              <li key={b.id} className={`demo__row ${b.visible ? '' : 'is-off'}`}>
                <span className="demo__ico"><Icon name={blockRegistry[b.type].icon} size={18} /></span>
                <span className="demo__txt"><strong>{t(`editor.blocks.${b.type}.label`)}</strong><small className="truncate">{blockSummary(b) || '—'}</small></span>
                <span className="demo__tools">
                  <IconButton size="sm" icon="arrow-up" label={t('marketing.demo.up')} disabled={i === 0} onClick={() => setBlocks((l) => move(l, i, i - 1))} />
                  <IconButton size="sm" icon="arrow-down" label={t('marketing.demo.down')} disabled={i === blocks.length - 1} onClick={() => setBlocks((l) => move(l, i, i + 1))} />
                  <IconButton size="sm" icon={b.visible ? 'eye' : 'eye-off'} label={b.visible ? t('marketing.demo.hide') : t('marketing.demo.show')} onClick={() => setBlocks((l) => l.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)))} />
                </span>
              </li>
            ))}
          </ol>
          <p className="subtle demo__hint"><Icon name="info" size={14} /> {t('marketing.demo.hint')} {t('marketing.demo.more')}</p>
        </div>
        <div className="demo__phone reveal">
          <PhoneFrame decorative label={t('marketing.demo.previewLabel')}>
            <PageRenderer page={doc} pageUrl={SAMPLE_URL} preview layout="profile" />
          </PhoneFrame>
        </div>
      </div>
    </section>
  );
}

const SWATCHES = ['#2563eb', '#7c3aed', '#db2777', '#0e7490', '#c2410c', '#15803d'];
const BTN: ButtonStyle[] = ['filled', 'outline', 'soft', 'gradient', 'glass'];
const RAD: Exclude<RadiusKey, 'custom'>[] = ['sharp', 'small', 'medium', 'pill'];

export function CustomizeSection() {
  const t = useT('marketing', 'common');
  const base = useMemo(() => getSampleDocument('professional'), []);
  const [theme, setTheme] = useState<ThemeId>('modern');
  const [btn, setBtn] = useState<ButtonStyle | null>(null);
  const [rad, setRad] = useState<RadiusKey | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const appearance = useMemo(() => {
    let a = getThemePreset(theme);
    if (btn) a = mergeAppearance(a, { button: { style: btn } });
    if (rad) a = mergeAppearance(a, { button: { radius: rad }, radius: rad });
    if (color) a = mergeAppearance(a, { colors: { primary: color, accent: color } });
    return a;
  }, [theme, btn, rad, color]);
  const doc = useMemo(() => ({ ...base, appearance }), [base, appearance]);
  const pick = (id: ThemeId) => { setTheme(id); setBtn(null); setRad(null); setColor(null); };
  return (
    <section className="section section--tint" id="customize" aria-labelledby="custom-title">
      <div className="container container--xl demo demo--reverse">
        <div className="demo__phone reveal">
          <PhoneFrame decorative label={t('marketing.demo.previewLabel')}><PageRenderer page={doc} pageUrl={SAMPLE_URL} preview layout="profile" /></PhoneFrame>
        </div>
        <div className="demo__copy reveal">
          <p className="eyebrow">{t('marketing.customize.eyebrow')}</p>
          <h2 id="custom-title" className="section__title">{t('marketing.customize.title')}</h2>
          <p className="section__sub">{t('marketing.customize.subtitle')}</p>
          <div className="ctl">
            <p className="ctl__label" id="ctl-theme">{t('marketing.customize.themes')}</p>
            <div className="chips" role="group" aria-labelledby="ctl-theme">
              {themeOrder.map((id) => {
                const p = getThemePreset(id);
                return (
                  <button key={id} type="button" className={`themechip ${theme === id ? 'is-active' : ''}`} aria-pressed={theme === id} onClick={() => pick(id)}>
                    <i style={{ background: p.background.type === 'gradient' ? `linear-gradient(135deg, ${p.background.gradient.from}, ${p.background.gradient.to})` : p.colors.background, borderColor: p.colors.border }}><b style={{ background: p.colors.primary }} /></i>
                    {t(`common.themes.${id}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="ctl-row">
            <div className="ctl">
              <p className="ctl__label" id="ctl-btn">{t('marketing.customize.buttons')}</p>
              <Segmented size="sm" label={t('marketing.customize.buttons')} value={btn ?? appearance.button.style} onChange={setBtn} options={BTN.map((b) => ({ value: b, label: t(`marketing.customize.btn.${b}`) }))} />
            </div>
            <div className="ctl">
              <p className="ctl__label">{t('marketing.customize.radius')}</p>
              <Segmented size="sm" label={t('marketing.customize.radius')} value={(rad ?? appearance.button.radius) as Exclude<RadiusKey, 'custom'>} onChange={setRad} options={RAD.map((r) => ({ value: r, label: t(`marketing.customize.r.${r}`) }))} />
            </div>
          </div>
          <div className="ctl">
            <p className="ctl__label" id="ctl-color">{t('marketing.customize.color')}</p>
            <div className="swatches" role="group" aria-labelledby="ctl-color">
              {SWATCHES.map((c) => (
                <button key={c} type="button" className={`swatch ${color === c ? 'is-active' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
          <p className="subtle demo__hint"><Icon name="info" size={14} /> {t('marketing.customize.note')}</p>
        </div>
      </div>
    </section>
  );
}
