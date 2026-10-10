import { useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Icon, PageHeader, Segmented, Skeleton, useToast, type Column } from '@/components/ui';
import { PLANS, getPlan } from '@/app/configuration/plans';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { PlanId } from '@/models/auth';
import type { BillingPeriod, ChangePlanResult, Invoice, InvoiceStatus } from '@/models/billing';
import { useSession } from '@/state/session';
import { formatCurrency, formatDate } from '@/utilities/format';
import './subscription.css';

const INVOICE_TONE: Record<InvoiceStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { paid: 'success', pending: 'warning', failed: 'danger', refunded: 'neutral' };
const INVOICE_ICON: Record<InvoiceStatus, 'check' | 'clock' | 'x' | 'reset'> = { paid: 'check', pending: 'clock', failed: 'x', refunded: 'reset' };

export default function SubscriptionPage() {
  const t = useT('billing', 'marketing', 'common', 'dashboard');
  useDocumentTitle(`${t('dashboard.nav.subscription')} · 1Link`);
  const toast = useToast();
  const user = useSession((s) => s.session?.user);
  const sub = useResource(() => api.billing.getSubscription(), []);
  const invoices = useResource(() => api.billing.listInvoices(), []);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [target, setTarget] = useState<PlanId | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ChangePlanResult | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const current = sub.data;
  const plan = getPlan(current?.planId ?? user?.plan ?? 'free');

  const confirmChange = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await api.billing.changePlan(target, period);
      setOutcome(res);
      if (res.status === 'checkout_required') window.location.assign(res.checkoutUrl);
      if (res.status === 'changed') { toast.push({ tone: 'success', title: t('billing.sub.changed') }); sub.reload(); }
    } catch {
      toast.push({ tone: 'error', title: t('billing.sub.changeFailed') });
    } finally {
      setBusy(false);
      setTarget(null);
    }
  };

  const toggleCancel = async () => {
    setBusy(true);
    try {
      if (current?.cancelAtPeriodEnd) await api.billing.resume(); else await api.billing.cancel();
      toast.push({ tone: 'success', title: current?.cancelAtPeriodEnd ? t('billing.sub.resumed') : t('billing.sub.canceled') });
      sub.reload();
    } catch {
      toast.push({ tone: 'error', title: t('billing.sub.changeFailed') });
    } finally {
      setBusy(false);
      setCancelOpen(false);
    }
  };

  const columns: Column<Invoice>[] = [
    { key: 'id', header: t('billing.sub.invoice'), primary: true, cell: (i) => <span className="mono">{i.id}</span> },
    { key: 'date', header: t('billing.sub.date'), cell: (i) => formatDate(i.date) },
    { key: 'plan', header: t('billing.sub.plan'), cell: (i) => t(`common.plans.${i.planId}`) },
    { key: 'amount', header: t('billing.sub.amount'), align: 'end', cell: (i) => formatCurrency(i.amount, i.currency) },
    { key: 'status', header: t('billing.sub.status'), align: 'end', cell: (i) => <Badge tone={INVOICE_TONE[i.status]} icon={INVOICE_ICON[i.status]}>{t(`billing.sub.invoiceStatus.${i.status}`)}</Badge> },
  ];

  return (
    <div className="subpg">
      <PageHeader title={t('dashboard.nav.subscription')} description={t('billing.sub.description')} />

      {outcome?.status === 'unavailable' && (
        <Alert tone="warning" title={t('billing.sub.unavailableTitle')} onDismiss={() => setOutcome(null)} className="subpg__alert">{t('billing.sub.unavailableText')}</Alert>
      )}

      <Card padding="lg" className="subpg__current">
        {sub.status === 'loading' ? <Skeleton height={80} radius={12} /> : sub.status === 'error' ? <ErrorState code={sub.error} onRetry={sub.reload} compact /> : (
          <>
            <div>
              <p className="eyebrow">{t('billing.sub.current')}</p>
              <h2 className="subpg__plan">{t(`common.plans.${plan.id}`)} <Badge tone={current?.status === 'active' ? 'success' : 'warning'} dot>{t(`dashboard.overview.subStatus.${current?.status ?? 'active'}`)}</Badge></h2>
              <p className="muted">{t(`marketing.pricing.desc.${plan.id}`)}</p>
              {current?.renewsAt && <p className="subpg__renew"><Icon name="calendar" size={16} /> {current.cancelAtPeriodEnd ? t('billing.sub.endsOn', { date: formatDate(current.renewsAt) }) : t('billing.sub.renewsOn', { date: formatDate(current.renewsAt) })}</p>}
            </div>
            {plan.id !== 'free' && current && (
              <Button variant="secondary" onClick={() => (current.cancelAtPeriodEnd ? void toggleCancel() : setCancelOpen(true))} loading={busy && !cancelOpen}>
                {current.cancelAtPeriodEnd ? t('billing.sub.resume') : t('billing.sub.cancel')}
              </Button>
            )}
          </>
        )}
      </Card>

      <section aria-labelledby="sub-plans" className="subpg__section">
        <div className="subpg__head">
          <h2 id="sub-plans">{t('billing.sub.changePlan')}</h2>
          <Segmented label={t('marketing.pricing.period')} value={period} onChange={setPeriod} options={[{ value: 'monthly', label: t('marketing.pricing.monthly') }, { value: 'yearly', label: t('marketing.pricing.yearly') }]} />
        </div>
        <ul role="list" className="subpg__plans">
          {PLANS.map((p) => {
            const isCurrent = p.id === plan.id;
            const amount = period === 'monthly' ? p.price.monthly : p.price.yearly;
            return (
              <li key={p.id} className={`planrow ${isCurrent ? 'is-current' : ''}`}>
                <div className="planrow__main">
                  <strong>{t(`common.plans.${p.id}`)}</strong>
                  <span className="planrow__price">{amount === 0 ? t('marketing.pricing.free') : `${formatCurrency(amount, p.price.currency)} ${period === 'monthly' ? t('marketing.pricing.perMonth') : t('marketing.pricing.perYear')}`}</span>
                  <small className="muted">{t(`marketing.pricing.desc.${p.id}`)}</small>
                </div>
                {isCurrent ? <Badge tone="brand" icon="check">{t('billing.sub.yourPlan')}</Badge> : (
                  <Button variant={p.id === 'free' ? 'secondary' : 'gradient'} size="sm" onClick={() => setTarget(p.id)}>{PLANS.findIndex((x) => x.id === p.id) > PLANS.findIndex((x) => x.id === plan.id) ? t('billing.sub.upgradeTo') : t('billing.sub.switchTo')} {t(`common.plans.${p.id}`)}</Button>
                )}
              </li>
            );
          })}
        </ul>
        <p className="subtle subpg__note"><Icon name="info" size={14} /> {t('marketing.pricing.indicative')}</p>
      </section>

      <section aria-labelledby="sub-invoices" className="subpg__section">
        <div className="subpg__head"><h2 id="sub-invoices">{t('billing.sub.history')}</h2></div>
        <DataTable
          caption={t('billing.sub.history')} columns={columns} rows={invoices.data} getRowId={(i) => i.id} loading={invoices.status === 'loading'} error={invoices.status === 'error' ? invoices.error : null} onRetry={invoices.reload}
          empty={<EmptyState compact icon="receipt" title={t('billing.sub.noInvoices')} description={t('billing.sub.noInvoicesText')} />}
        />
        <ul role="list" className="subpg__legend">
          {(['paid', 'pending', 'failed', 'refunded'] as const).map((s) => <li key={s}><Badge tone={INVOICE_TONE[s]} icon={INVOICE_ICON[s]}>{t(`billing.sub.invoiceStatus.${s}`)}</Badge><span className="subtle">{t(`billing.sub.invoiceHelp.${s}`)}</span></li>)}
        </ul>
      </section>

      <ConfirmDialog
        open={target !== null} loading={busy} onCancel={() => setTarget(null)} onConfirm={() => void confirmChange()}
        title={t('billing.sub.confirmTitle', { plan: target ? t(`common.plans.${target}`) : '' })} description={t('billing.sub.confirmText')} confirmLabel={t('billing.sub.confirm')}
      >
        <Alert tone="info">{t('billing.sub.confirmNote')}</Alert>
      </ConfirmDialog>
      <ConfirmDialog open={cancelOpen} tone="danger" loading={busy} onCancel={() => setCancelOpen(false)} onConfirm={() => void toggleCancel()} title={t('billing.sub.cancelTitle')} description={t('billing.sub.cancelText')} confirmLabel={t('billing.sub.cancel')} />
    </div>
  );
}
