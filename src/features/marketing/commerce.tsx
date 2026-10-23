import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, ChartCard, Icon, LinkButton, Segmented } from '@/components/ui';
import { ChartLegend, HBarList, TimeChart } from '@/components/charts/charts';
import { COMPARISON_TOKENS, PLANS, PLAN_COMPARISON } from '@/app/configuration/plans';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { formatCurrency, formatDate } from '@/utilities/format';
import type { BillingPeriod } from '@/models/billing';
import type { MessageKey } from '@/i18n/types';

/** Série fictive déterministe pour l'illustration (aucune donnée réelle). */
function illustrativeSeries() {
  const days = 30;
  const views: number[] = [];
  const clicks: number[] = [];
  for (let i = 0; i < days; i++) {
    const v = Math.round(40 + i * 2.2 + Math.sin(i * 0.9) * 14 + (i % 7 === 5 ? 26 : 0));
    views.push(v);
    clicks.push(Math.round(v * (0.36 + Math.cos(i * 0.5) * 0.06)));
  }
  const base = new Date(Date.UTC(2026, 8, 1));
  const dates = views.map((_, i) => new Date(base.getTime() + i * 86_400_000));
  return { views, clicks, dates };
}

export function AnalyticsPreview() {
  const t = useT('marketing');
  const s = useMemo(illustrativeSeries, []);
  const x = s.dates.map((d) => formatDate(d, { day: 'numeric', month: 'short' }, 'UTC'));
  return (
    <section className="section" id="analytics" aria-labelledby="an-title">
      <div className="container container--xl demo">
        <div className="demo__copy reveal">
          <p className="eyebrow">{t('marketing.analytics.eyebrow')}</p>
          <h2 id="an-title" className="section__title">{t('marketing.analytics.title')}</h2>
          <p className="section__sub">{t('marketing.analytics.subtitle')}</p>
          <ul role="list" className="ticks">
            {(['a', 'b', 'c'] as const).map((k) => <li key={k}><Icon name="check-circle" size={18} />{t(`marketing.analytics.bullets.${k}`)}</li>)}
          </ul>
        </div>
        <div className="reveal anprev">
          <ChartCard title={t('marketing.analytics.chartTitle')} actions={<Badge tone="neutral">{t('marketing.analytics.illustration')}</Badge>}
            description={t('marketing.analytics.illustrativeNote')}
            footer={<ChartLegend items={[{ label: t('marketing.analytics.views') }, { label: t('marketing.analytics.clicks') }]} />}>
            <TimeChart label={t('marketing.analytics.chartTitle')} x={x} height={220} series={[{ id: 'v', label: t('marketing.analytics.views'), values: s.views }, { id: 'c', label: t('marketing.analytics.clicks'), values: s.clicks }]} />
          </ChartCard>
          <Card padding="md">
            <h3 className="chartcard__title" style={{ marginBottom: 'var(--space-4)' }}>{t('marketing.analytics.topLinks')}</h3>
            <HBarList items={[{ label: 'Dernière vidéo', value: 412 }, { label: 'Collaborations', value: 268 }, { label: 'WhatsApp', value: 181 }]} />
          </Card>
        </div>
      </div>
    </section>
  );
}

export function PlanCards({ period, ctaTo = paths.register }: { period: BillingPeriod; ctaTo?: string }) {
  const t = useT('marketing', 'billing', 'common');
  return (
    <ul role="list" className="plans">
      {PLANS.map((p) => {
        const amount = period === 'monthly' ? p.price.monthly : p.price.yearly;
        const isFree = p.id === 'free';
        return (
          <li key={p.id} className={`plan plan--${p.id} ${p.highlighted ? 'is-featured' : ''}`}>
            {p.highlighted && <Badge tone="violet" icon="sparkles" className="plan__badge">{t('marketing.pricing.popular')}</Badge>}
            <div className="plan__header">
              <div className="plan__title-row">
                <h3>{t(`common.plans.${p.id}`)}</h3>
                {isFree ? (
                  <Badge tone="success" className="plan__pill-badge">{t('marketing.pricing.badgeFree')}</Badge>
                ) : (
                  <Badge tone={p.highlighted ? 'violet' : 'neutral'} className="plan__pill-badge">{t('marketing.pricing.badgeTrial')}</Badge>
                )}
              </div>
              <p className="plan__desc">{t(`marketing.pricing.desc.${p.id}`)}</p>
            </div>
            <div className="plan__price">
              {amount === 0 ? (
                <>
                  <strong>{t('marketing.pricing.free')}</strong>
                  <span className="plan__period">{t('marketing.pricing.forever')}</span>
                </>
              ) : (
                <>
                  <strong>{formatCurrency(amount, p.price.currency)}</strong>
                  <span className="plan__period">{period === 'monthly' ? t('marketing.pricing.perMonth') : t('marketing.pricing.perYear')}</span>
                </>
              )}
            </div>
            <ul role="list" className="plan__features">
              {p.features.map((f) => (
                <li key={f}>
                  <Icon name="check" size={16} strokeWidth={3} />
                  <span>{t(`billing.features.${f as 'freeForever'}`)}</span>
                </li>
              ))}
            </ul>
            <div className="plan__footer">
              <LinkButton to={ctaTo} variant={p.highlighted ? 'gradient' : 'secondary'} fullWidth size="lg">
                {isFree ? t('marketing.pricing.start') : t('marketing.pricing.choose', { plan: t(`common.plans.${p.id}`) })}
              </LinkButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PricingSection({ withComparison = false, headingLevel = 2 }: { withComparison?: boolean; headingLevel?: 1 | 2 }) {
  const t = useT('marketing', 'billing', 'common');
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const H = `h${headingLevel}` as 'h1' | 'h2';
  return (
    <section className="section section--tint" id="pricing" aria-labelledby="pricing-title">
      <div className="container container--xl">
        <div className="section__head reveal is-center">
          <p className="eyebrow">{t('marketing.pricing.eyebrow')}</p>
          <H id="pricing-title" className="section__title">{t('marketing.pricing.title')}</H>
          <p className="section__sub">{t('marketing.pricing.subtitle')}</p>
          <Segmented label={t('marketing.pricing.period')} value={period} onChange={setPeriod} options={[{ value: 'monthly', label: t('marketing.pricing.monthly') }, { value: 'yearly', label: t('marketing.pricing.yearly') }]} className="plans__toggle" />
        </div>
        <div className="reveal"><PlanCards period={period} /></div>
        <p className="center subtle plans__note"><Icon name="info" size={14} /> {t('marketing.pricing.indicative')}</p>
        {withComparison && (
          <div className="compare reveal">
            <h2 className="chartcard__title">{t('marketing.pricing.comparisonTitle')}</h2>
            <div className="dtable__scroll">
              <table className="dtable__table compare__table">
                <caption className="sr-only">{t('marketing.pricing.comparisonTitle')}</caption>
                <thead><tr><th scope="col"><span className="sr-only">{t('marketing.pricing.comparisonTitle')}</span></th>{PLANS.map((p) => <th key={p.id} scope="col" className="is-end">{t(`common.plans.${p.id}`)}</th>)}</tr></thead>
                <tbody>
                  {PLAN_COMPARISON.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{t(`billing.comparison.${row.key as 'blocks'}`)}</th>
                      {PLANS.map((p) => {
                        const v = row.values[p.id];
                        return (
                          <td key={p.id} className="is-end">
                            {v === true ? <><Icon name="check" size={18} strokeWidth={3} /><span className="sr-only">Oui</span></> : v === false ? <><Icon name="minus" size={18} /><span className="sr-only">Non</span></> : (COMPARISON_TOKENS as readonly string[]).includes(v) ? t(`billing.comparison.${v as 'community'}`) : v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function FaqSection({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const t = useT('marketing');
  const base = useId();
  const [open, setOpen] = useState<string | null>('q1');
  const H = `h${headingLevel}` as 'h1' | 'h2';
  const keys = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="container container--md">
        <div className="section__head reveal is-center">
          <p className="eyebrow">{t('marketing.faq.eyebrow')}</p>
          <H id="faq-title" className="section__title">{t('marketing.faq.title')}</H>
        </div>
        <div className="faq reveal">
          {keys.map((k) => {
            const isOpen = open === k;
            return (
              <div key={k} className={`faq__item ${isOpen ? 'is-open' : ''}`}>
                <h3>
                  <button type="button" id={`${base}-${k}-b`} aria-expanded={isOpen} aria-controls={`${base}-${k}-p`} onClick={() => setOpen(isOpen ? null : k)}>
                    {t(`marketing.faq.items.${k}.q` as MessageKey)}
                    <Icon name="plus" size={20} className="faq__icon" />
                  </button>
                </h3>
                <div id={`${base}-${k}-p`} role="region" aria-labelledby={`${base}-${k}-b`} hidden={!isOpen} className="faq__panel">
                  <p>{t(`marketing.faq.items.${k}.a` as MessageKey)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  const t = useT('marketing');
  return (
    <section className="section" aria-labelledby="final-title">
      <div className="container container--xl">
        <div className="finalcta reveal">
          <div className="finalcta__glow" aria-hidden="true" />
          <h2 id="final-title">{t('marketing.final.title')}</h2>
          <p>{t('marketing.final.text')}</p>
          <div className="finalcta__actions">
            <Link to={paths.register} className="btn btn--lg finalcta__primary"><span className="btn__label">{t('marketing.final.cta')}</span><Icon name="arrow-right" size={18} /></Link>
            <Link to="/#pricing" className="btn btn--lg finalcta__secondary"><span className="btn__label">{t('marketing.final.secondary')}</span></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
