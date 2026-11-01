import { useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, EmptyState, ErrorState, Modal, Skeleton, useToast } from '@/components/ui';
import { pageShareUrl } from '@/app/configuration/env';
import { useResource } from '@/hooks/useResource';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import { CARD_ORDER_STATUSES, type CardDesign, type CardItem, type CardOrder, type CardOrderStatus } from '@/models/cards';
import { api } from '@/services/api';
import { formatCurrency, formatDateTime } from '@/utilities/format';
import { qrPngBlob } from '@/utilities/share';
import { CardPreview } from './CardPreview';
import { DesignFields } from './DesignFields';
import { downloadBlob } from './print';

const FLOW: readonly CardOrderStatus[] = ['awaiting_payment', 'paid', 'validating', 'in_production', 'quality_check', 'shipped', 'delivered'];
const TONE: Record<CardOrderStatus, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
  awaiting_payment: 'warning', paid: 'info', validating: 'info', in_production: 'info', quality_check: 'info', shipped: 'success', delivered: 'success', canceled: 'neutral',
};
export const statusTone = (s: CardOrderStatus) => TONE[s];

function OrderTimeline({ status }: { status: CardOrderStatus }) {
  const t = useT('cards');
  if (status === 'canceled') return <Badge tone="neutral" dot>{t('cards.status.canceled')}</Badge>;
  const at = FLOW.indexOf(status);
  return (
    <ol className="timeline" role="list" aria-label={t('cards.orders.progress')}>
      {FLOW.map((s, i) => <li key={s} className={i < at ? 'is-done' : i === at ? 'is-done is-current' : ''} aria-current={i === at ? 'step' : undefined}>{t(`cards.status.${s}`)}</li>)}
    </ol>
  );
}

function CardRow({ card, onChanged }: { card: CardItem; onChanged: () => void }) {
  const t = useT('cards', 'common');
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const off = card.status === 'disabled';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.url);
      toast.push({ tone: 'success', title: t('cards.orders.copied') });
    } catch {
      toast.push({ tone: 'error', title: t('cards.orders.copyFailed') });
    }
  };
  const qr = async () => {
    const blob = await qrPngBlob(card.url);
    if (blob) downloadBlob(blob, `1link-carte-${card.code}.png`);
  };
  const toggle = async (active: boolean) => {
    setBusy(true);
    try {
      await api.cards.setCardActive(card.id, active);
      toast.push({ tone: 'success', title: active ? t('cards.orders.reactivated') : t('cards.orders.deactivated') });
      setConfirm(false);
      onChanged();
    } catch (e) {
      toast.push({ tone: 'error', title: isApiError(e) && e.message === 'disabled_by_admin' ? t('cards.orders.disabledByTeam') : t('cards.errors.unknown') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`mycard ${off ? 'is-off' : ''}`}>
      <div>
        <div className="mycard__url">{card.url.replace(/^https?:\/\//, '')}</div>
        <small className="subtle">
          {t('cards.orders.scans', { count: card.scanCount })}
          {card.nfc && <> · NFC : {card.nfc.result === 'passed' ? t('cards.orders.nfcReady') : t('cards.orders.nfcPending')}</>}
        </small>
      </div>
      <div className="mycard__tools">
        <Badge tone={off ? 'danger' : 'success'} dot>{off ? t('cards.orders.off') : t('cards.orders.on')}</Badge>
        <Button size="sm" variant="ghost" iconLeft="copy" onClick={() => void copy()}>{t('cards.orders.copy')}</Button>
        <Button size="sm" variant="ghost" iconLeft="qr" onClick={() => void qr()}>{t('cards.orders.qr')}</Button>
        {off
          ? card.disabledBy !== 'admin' && <Button size="sm" variant="secondary" loading={busy} onClick={() => void toggle(true)}>{t('cards.orders.reactivate')}</Button>
          : <Button size="sm" variant="secondary" iconLeft="ban" onClick={() => setConfirm(true)}>{t('cards.orders.deactivate')}</Button>}
      </div>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={() => toggle(false)} loading={busy} tone="danger" title={t('cards.orders.deactivateTitle')} description={t('cards.orders.deactivateText')} confirmLabel={t('cards.orders.deactivate')} />
    </li>
  );
}

function EditDesign({ order, onClose, onSaved }: { order: CardOrder; onClose: () => void; onSaved: () => void }) {
  const t = useT('cards', 'common');
  const toast = useToast();
  const [design, setDesign] = useState<CardDesign>(order.design);
  const [busy, setBusy] = useState(false);
  const url = order.username ? pageShareUrl(order.username) : '';
  const save = async () => {
    if (!design.name.trim()) return;
    setBusy(true);
    try {
      await api.cards.updateDesign(order.id, design);
      toast.push({ tone: 'success', title: t('cards.orders.designSaved') });
      onSaved();
      onClose();
    } catch {
      toast.push({ tone: 'error', title: t('cards.errors.unknown') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={busy ? () => undefined : onClose} size="lg" title={t('cards.orders.editDesign')} description={t('cards.orders.editDesignText')}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button><Button variant="gradient" loading={busy} disabled={!design.name.trim()} onClick={() => void save()}>{t('common.save')}</Button></>}>
      <div className="cardform">
        <CardPreview design={design} url={url} nfc={order.kind === 'nfc'} />
        <DesignFields design={design} onChange={(p) => setDesign((d) => ({ ...d, ...p }))} />
      </div>
    </Modal>
  );
}

function OrderCard({ order, instructions, onChanged, highlighted }: { order: CardOrder; instructions: string; onChanged: () => void; highlighted: boolean }) {
  const t = useT('cards', 'common');
  const toast = useToast();
  const [cancelAsk, setCancelAsk] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Le verso montre le QR code définitif de la première carte (chaque carte a le sien, mêmes informations au recto).
  const url = order.cards[0]?.url ?? (order.username ? pageShareUrl(order.username) : '');
  const canEdit = ['awaiting_payment', 'paid', 'validating'].includes(order.status);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.cards.cancelOrder(order.id);
      setCancelAsk(false);
      onChanged();
    } catch {
      toast.push({ tone: 'error', title: t('cards.errors.unknown') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`card order ${highlighted ? 'is-highlighted' : ''}`} id={`order-${order.id}`}>
      <div className="order__head">
        <div>
          <div className="order__ref">{order.reference}</div>
          <div className="order__meta">
            <span>{formatDateTime(order.createdAt)}</span>
            <span>{t('cards.orders.cardsCount', { count: order.cardsCount })}</span>
            <span>{t(`cards.kinds.${order.kind}.label`)} · {t(`cards.templates.${order.design.templateId}`)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Badge tone={TONE[order.status]} dot>{t(`cards.status.${order.status}`)}</Badge>
          <div><strong>{formatCurrency(order.total, order.currency)}</strong></div>
        </div>
      </div>

      <OrderTimeline status={order.status} />

      <div className="order__body">
        <CardPreview design={order.design} url={url} nfc={order.kind === 'nfc'} />
        <div style={{ display: 'grid', gap: 'var(--space-3)', alignContent: 'start' }}>
          {order.status === 'awaiting_payment' && (
            <div className="paybox">
              <strong>{t('cards.orders.payTitle', { total: formatCurrency(order.total, order.currency) })}</strong>
              <p>{instructions || t('cards.orders.payDefault')}</p>
              <p><strong>{t('cards.orders.payReference')} :</strong> <span className="mono">{order.reference}</span></p>
              <small className="subtle">{t('cards.orders.payNote')}</small>
            </div>
          )}
          {order.designNote && !order.designApprovedAt && <Alert tone="warning" title={t('cards.orders.designRefused')}>{order.designNote}</Alert>}
          {order.designApprovedAt && order.status !== 'canceled' && <Badge tone="success" icon="check-circle">{t('cards.orders.designApproved')}</Badge>}
          {order.shipping.trackingRef && <p className="subtle">{t('cards.orders.tracking')} : <strong>{order.shipping.carrier ? `${order.shipping.carrier} · ` : ''}{order.shipping.trackingRef}</strong></p>}
          <p className="subtle">{t('cards.orders.deliveryTo', { name: order.delivery.fullName, city: order.delivery.city })}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {canEdit && <Button size="sm" variant="secondary" iconLeft="pencil" onClick={() => setEditing(true)}>{t('cards.orders.editDesign')}</Button>}
            {order.status === 'awaiting_payment' && <Button size="sm" variant="ghost" iconLeft="x" onClick={() => setCancelAsk(true)}>{t('cards.orders.cancel')}</Button>}
          </div>
        </div>
      </div>

      {order.status !== 'canceled' && (
        <details>
          <summary className="subtle" style={{ cursor: 'pointer' }}>{t('cards.orders.yourCards', { count: order.cards.length })}</summary>
          <ul className="mycards" role="list" style={{ marginTop: 'var(--space-3)' }}>
            {order.cards.map((c) => <CardRow key={c.id} card={c} onChanged={onChanged} />)}
          </ul>
          <p className="subtle" style={{ marginTop: 'var(--space-2)' }}>{t('cards.orders.sameAddress')}</p>
        </details>
      )}

      {editing && <EditDesign order={order} onClose={() => setEditing(false)} onSaved={onChanged} />}
      <ConfirmDialog open={cancelAsk} onCancel={() => setCancelAsk(false)} onConfirm={cancel} loading={busy} tone="danger" title={t('cards.orders.cancelTitle')} description={t('cards.orders.cancelText', { reference: order.reference })} confirmLabel={t('cards.orders.cancel')} />
    </li>
  );
}

export function OrdersPanel({ highlight, onNew }: { highlight: string | null; onNew: () => void }) {
  const t = useT('cards');
  const orders = useResource(() => api.cards.listOrders(), []);
  const catalog = useResource(() => api.cards.getCatalog(), []);
  if (orders.status === 'loading') return <Skeleton height={260} radius={16} />;
  if (orders.status === 'error') return <ErrorState code={orders.error} onRetry={orders.reload} />;
  const list = orders.data ?? [];
  if (!list.length) return <EmptyState icon="qr" title={t('cards.orders.emptyTitle')} description={t('cards.orders.emptyText')} action={<Button variant="gradient" onClick={onNew}>{t('cards.orders.emptyCta')}</Button>} />;
  return (
    <ul className="orders" role="list">
      {list.map((o) => <OrderCard key={o.id} order={o} instructions={catalog.data?.paymentInstructions ?? ''} onChanged={orders.reload} highlighted={o.id === highlight} />)}
    </ul>
  );
}

export { CARD_ORDER_STATUSES };
