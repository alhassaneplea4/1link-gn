import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, LinkButton, type IconName } from '@/components/ui';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { CATEGORY_CONFIG, type FocusId } from '@/features/categories/config';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { getSampleDocument } from '@/features/page-engine/samples';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { CATEGORY_IDS, type CategoryId } from '@/models/category';

const CHANNELS: { icon: IconName; name: string }[] = [
  { icon: 'instagram', name: 'Instagram' }, { icon: 'whatsapp', name: 'WhatsApp' }, { icon: 'tiktok', name: 'TikTok' },
  { icon: 'facebook', name: 'Facebook' }, { icon: 'youtube', name: 'YouTube' }, { icon: 'linkedin', name: 'LinkedIn' },
  { icon: 'mail', name: 'E-mail' }, { icon: 'globe', name: 'Site web' },
];

function SectionHead({ id, eyebrow, title, sub, center = true }: { id: string; eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={`section__head reveal ${center ? 'is-center' : ''}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="section__title">{title}</h2>
      {sub && <p className="section__sub">{sub}</p>}
    </div>
  );
}

export function ProblemSection() {
  const t = useT('marketing');
  const items = [{ k: 'a', icon: 'link' }, { k: 'b', icon: 'type' }, { k: 'c', icon: 'gauge' }] as const;
  return (
    <section className="section" aria-labelledby="problem-title">
      <div className="container container--xl">
        <SectionHead id="problem-title" eyebrow={t('marketing.problem.eyebrow')} title={t('marketing.problem.title')} sub={t('marketing.problem.subtitle')} />
        <div className="scatter reveal" aria-hidden="true">
          {CHANNELS.map((c, i) => (
            <span key={c.name} className="scatter__chip" style={{ '--i': i } as React.CSSProperties}><Icon name={c.icon} size={18} />{c.name}</span>
          ))}
        </div>
        <ul role="list" className="cards3">
          {items.map((it) => (
            <li key={it.k} className="mcard reveal">
              <span className="mcard__icon mcard__icon--warn"><Icon name={it.icon} size={22} /></span>
              <h3>{t(`marketing.problem.items.${it.k}.title`)}</h3>
              <p>{t(`marketing.problem.items.${it.k}.text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SolutionSection() {
  const t = useT('marketing');
  const items = [{ k: 'a', icon: 'qr' }, { k: 'b', icon: 'palette' }, { k: 'c', icon: 'chart' }] as const;
  return (
    <section className="section section--dark" aria-labelledby="solution-title">
      <div className="container container--xl">
        <SectionHead id="solution-title" eyebrow={t('marketing.solution.eyebrow')} title={t('marketing.solution.title')} sub={t('marketing.solution.subtitle')} />
        <div className="converge reveal" aria-hidden="true">
          <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="converge__lines">
            {CHANNELS.slice(0, 6).map((_, i) => (
              <path key={i} d={`M ${40 + i * 104} 0 C ${40 + i * 104} 70, 300 40, 300 118`} fill="none" stroke="url(#cv)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            ))}
            <defs><linearGradient id="cv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c9bff" stopOpacity="0.2" /><stop offset="1" stopColor="#b490ff" /></linearGradient></defs>
          </svg>
          <div className="converge__pill"><Icon name="link" size={18} /><span>1link.gn/<strong>vous</strong></span></div>
        </div>
        <ul role="list" className="cards3">
          {items.map((it) => (
            <li key={it.k} className="mcard mcard--dark reveal">
              <span className="mcard__icon"><Icon name={it.icon} size={22} /></span>
              <h3>{t(`marketing.solution.items.${it.k}.title`)}</h3>
              <p>{t(`marketing.solution.items.${it.k}.text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HowSection() {
  const t = useT('marketing');
  const steps = ['s1', 's2', 's3', 's4'] as const;
  return (
    <section className="section" aria-labelledby="how-title">
      <div className="container container--xl">
        <SectionHead id="how-title" eyebrow={t('marketing.how.eyebrow')} title={t('marketing.how.title')} />
        <ol role="list" className="steps">
          {steps.map((s, i) => (
            <li key={s} className="step reveal" style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="step__n" aria-hidden="true">{i + 1}</span>
              <h3>{t(`marketing.how.steps.${s}.title`)}</h3>
              <p>{t(`marketing.how.steps.${s}.text`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function AudiencesSection() {
  const t = useT('marketing', 'common');
  const [cat, setCat] = useState<CategoryId>('creator');
  const doc = useMemo(() => getSampleDocument(cat), [cat]);
  const cfg = CATEGORY_CONFIG[cat];
  const focus = [...new Set(cfg.focus.map((f) => f.id))] as FocusId[];
  return (
    <section className="section" id="audiences" aria-labelledby="aud-title">
      <div className="container container--xl">
        <SectionHead id="aud-title" eyebrow={t('marketing.audiences.eyebrow')} title={t('marketing.audiences.title')} sub={t('marketing.audiences.subtitle')} />
        <div className="aud reveal">
          <div className="aud__main">
            <div role="tablist" aria-label={t('marketing.audiences.tabs')} className="aud__tabs"
              onKeyDown={(e) => {
                const i = CATEGORY_IDS.indexOf(cat);
                const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const n = CATEGORY_IDS[(i + d + CATEGORY_IDS.length) % CATEGORY_IDS.length]!;
                setCat(n);
                (e.currentTarget.querySelector(`[data-cat="${n}"]`) as HTMLElement | null)?.focus();
              }}>
              {CATEGORY_IDS.map((c) => (
                <button key={c} type="button" role="tab" data-cat={c} id={`tab-${c}`} aria-selected={cat === c} aria-controls="aud-panel" tabIndex={cat === c ? 0 : -1} className={`aud__tab ${cat === c ? 'is-active' : ''}`} onClick={() => setCat(c)}>
                  <Icon name={CATEGORY_CONFIG[c].icon} size={20} />
                  <span>{t(`common.categories.${c}.label`)}</span>
                </button>
              ))}
            </div>
            <div role="tabpanel" id="aud-panel" aria-labelledby={`tab-${cat}`} className="aud__panel" key={cat}>
              <h3>{t(`common.categories.${cat}.label`)} <small>{t(`common.categories.${cat}.short`)}</small></h3>
              <p className="muted">{t(`common.categories.${cat}.description`)}</p>
              <p className="aud__label">{t('marketing.audiences.highlights')}</p>
              <ul role="list" className="aud__focus">
                {focus.map((f) => <li key={f}><Icon name="check" size={14} strokeWidth={3} />{t(`marketing.audiences.focus.${f}`)}</li>)}
              </ul>
              <LinkButton to={`${paths.register}`} variant="gradient" iconRight="arrow-right">{t('marketing.audiences.cta', { category: t(`common.categories.${cat}.label`).toLowerCase() })}</LinkButton>
            </div>
          </div>
          <div className="aud__phone">
            <PhoneFrame decorative label={t(`common.categories.${cat}.label`)}><PageRenderer page={doc} pageUrl="https://1link.gn/exemple" preview layout="profile" /></PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES: { k: string; icon: IconName }[] = [
  { k: 'blocks', icon: 'layers' }, { k: 'themes', icon: 'palette' }, { k: 'qr', icon: 'qr' },
  { k: 'contact', icon: 'chat' }, { k: 'analytics', icon: 'chart' }, { k: 'categories', icon: 'users' },
  { k: 'order', icon: 'whatsapp' }, { k: 'vcard', icon: 'user-check' }, { k: 'lite', icon: 'zap' },
  { k: 'fast', icon: 'gauge' }, { k: 'access', icon: 'eye' }, { k: 'languages', icon: 'languages' },
];

export function FeaturesSection({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const t = useT('marketing');
  const H = `h${headingLevel}` as 'h1' | 'h2';
  return (
    <section className="section section--tint" id="features" aria-labelledby="feat-title">
      <div className="container container--xl">
        <div className="section__head reveal is-center">
          <p className="eyebrow">{t('marketing.features.eyebrow')}</p>
          <H id="feat-title" className="section__title">{t('marketing.features.title')}</H>
          <p className="section__sub">{t('marketing.features.subtitle')}</p>
        </div>
        <ul role="list" className="fgrid">
          {FEATURES.map((f, i) => (
            <li key={f.k} className="fcard reveal" style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
              <span className="mcard__icon"><Icon name={f.icon} size={22} /></span>
              <h3>{t(`marketing.features.items.${f.k as 'blocks'}.title`)}</h3>
              <p>{t(`marketing.features.items.${f.k as 'blocks'}.text`)}</p>
            </li>
          ))}
        </ul>
        <p className="center" style={{ marginTop: 'var(--space-8)' }}><Link to={paths.register} className="btn btn--gradient btn--lg"><span className="btn__label">{t('marketing.nav.cta')}</span></Link></p>
      </div>
    </section>
  );
}
