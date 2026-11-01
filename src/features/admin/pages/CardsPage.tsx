import { useState } from 'react';
import { Alert, Badge, Button, DataTable, Drawer, ErrorState, Input, PageHeader, SearchBar, Segmented, Select, Skeleton, Textarea, useToast, type Column } from '@/components/ui';
import { pageShareUrl } from '@/app/configuration/env';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { useResource } from '@/hooks/useResource';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import {
  CARD_ORDER_STATUSES, CARD_STATUS_FLOW, PAYMENT_METHODS_CARDS, type AdminCardOrder, type AdminCardOrderRow, type CardItem, type CardOrderStatus, type CardProduct, type NfcTestResult,
} from '@/models/cards';
import { CardPreview } from '@/features/cards/CardPreview';
import { downloadPrintFile, printPixels } from '@/features/cards/print';
import { statusTone } from '@/features/cards/OrdersPanel';
import { formatCurrency, formatDateTime } from '@/utilities/format';
import { FilterSelect, ReadOnlyNote, useAdminList, useCanWrite } from '../shared';
import '@/features/cards/cards.css';

/** Message lisible pour un code d'erreur du serveur. */
function useApiMessage() {
  const t = useT('admin');
  return (e: unknown) => {
    const code = isApiError(e) ? e.message : 'unknown';
    const known = ['invalid_transition', 'payment_required', 'design_not_approved', 'partner_required', 'nfc_not_tested', 'nfc_url_mismatch', 'nfc_incomplete', 'nfc_closed', 'not_awaiting_payment', 'design_review_closed', 'note_required', 'production_closed', 'not_nfc', 'invalid', 'forbidden'];
    return known.includes(code) ? t(`admin.cards.errors.${code as 'invalid_transition'}`) : t('admin.actionFailed');
  };
}

function NfcRow({ card, order, writable, onUpdated }: { card: CardItem; order: AdminCardOrder; writable: boolean; onUpdated: (o: AdminCardOrder) => void }) {
  const t = useT('admin', 'cards');
  const toast = useToast();
  const message = useApiMessage();
  const [chipId, setChipId] = useState(card.nfc?.chipId ?? '');
  const [programmedUrl, setProgrammedUrl] = useState(card.nfc?.programmedUrl ?? '');
  const [result, setResult] = useState<NfcTestResult>(card.nfc?.result ?? 'untested');
  const [busy, setBusy] = useState(false);
  const editable = writable && ['in_production', 'quality_check'].includes(order.status);

  const save = async () => {
    setBusy(true);
    try {
      onUpdated(await api.admin.recordCardNfc(card.id, { chipId, programmedUrl, result }));
      toast.push({ tone: 'success', title: t('admin.cards.saved') });
    } catch (e) {
      toast.push({ tone: 'error', title: message(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cardform" style={{ marginTop: 'var(--space-2)' }}>
      <div className="cardform__row">
        <Input label={t('admin.cards.chipId')} value={chipId} maxLength={60} disabled={!editable} onChange={(e) => setChipId(e.target.value)} />
        <Select label={t('admin.cards.nfcResult')} value={result} disabled={!editable} onChange={(e) => setResult(e.target.value as NfcTestResult)}>
          {(['untested', 'passed', 'failed'] as const).map((r) => <option key={r} value={r}>{t(`admin.cards.nfcResults.${r}`)}</option>)}
        </Select>
      </div>
      <Input label={t('admin.cards.programmedUrl')} hint={t('admin.cards.programmedUrlHint')} value={programmedUrl} maxLength={300} disabled={!editable} onChange={(e) => setProgrammedUrl(e.target.value)} />
      {editable && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" onClick={() => setProgrammedUrl(card.url)}>{t('admin.cards.useExpected')}</Button>
          <Button size="sm" variant="gradient" loading={busy} onClick={() => void save()}>{t('admin.cards.saveNfc')}</Button>
        </div>
      )}
    </div>
  );
}

function OrderDetail({ initial, onChanged }: { initial: AdminCardOrder; onChanged: () => void }) {
  const t = useT('admin', 'cards');
  const toast = useToast();
  const message = useApiMessage();
  const writable = useCanWrite('cards');
  const [order, setOrder] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS_CARDS)[number]>('mobile_money');
  const [payRef, setPayRef] = useState('');
  const [note, setNote] = useState('');
  const [partner, setPartner] = useState(order.printPartner);
  const [partnerRef, setPartnerRef] = useState(order.partnerRef);
  const [carrier, setCarrier] = useState(order.shipping.carrier);
  const [tracking, setTracking] = useState(order.shipping.trackingRef);
  const url = order.username ? pageShareUrl(order.username) : '';

  const run = async (key: string, fn: () => Promise<AdminCardOrder>, ok?: string) => {
    setBusy(key);
    try {
      const next = await fn();
      setOrder(next);
      onChanged();
      toast.push({ tone: 'success', title: ok ?? t('admin.cards.saved') });
    } catch (e) {
      toast.push({ tone: 'error', title: message(e) });
    } finally {
      setBusy(null);
    }
  };
  const update = (o: AdminCardOrder) => { setOrder(o); onChanged(); };

  const download = async (side: 'front' | 'back', format: 'svg' | 'png', card?: CardItem) => {
    setBusy(`dl-${side}-${format}-${card?.code ?? ''}`);
    try {
      await downloadPrintFile({ design: order.design, url: card?.url ?? '', nfc: order.kind === 'nfc', side }, order.reference, card?.code, format);
    } catch {
      toast.push({ tone: 'error', title: t('admin.cards.downloadFailed') });
    } finally {
      setBusy(null);
    }
  };

  const next = CARD_STATUS_FLOW[order.status];
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <section style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone={statusTone(order.status)} dot>{t(`cards.status.${order.status}`)}</Badge>
          <strong>{formatCurrency(order.total, order.currency)}</strong>
          <span className="subtle">{order.cardsCount} × {order.kind === 'nfc' ? 'QR + NFC' : 'QR'}</span>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          {t('admin.cards.customer')} : <strong>{order.customer.name}</strong> · {order.customer.email ?? order.customer.phone ?? '—'}
          <br />{t('admin.cards.profile')} : {order.username ? `@${order.username}` : '—'}
          <br />{t('admin.cards.deliveryTo')} : {order.delivery.fullName} · {order.delivery.phone} · {order.delivery.address}, {order.delivery.city}
          {order.delivery.notes && <><br />{t('admin.cards.notes')} : {order.delivery.notes}</>}
        </p>
      </section>

      {order.status === 'awaiting_payment' && writable && (
        <section className="paybox">
          <strong>{t('admin.cards.paymentTitle')}</strong>
          <p>{t('admin.cards.paymentHelp', { reference: order.reference, total: formatCurrency(order.total, order.currency) })}</p>
          <div className="cardform__row">
            <Select label={t('admin.cards.method')} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              {PAYMENT_METHODS_CARDS.map((m) => <option key={m} value={m}>{t(`admin.cards.methods.${m}`)}</option>)}
            </Select>
            <Input label={t('admin.cards.paymentRef')} value={payRef} maxLength={80} onChange={(e) => setPayRef(e.target.value)} />
          </div>
          <Button variant="gradient" size="sm" disabled={!payRef.trim()} loading={busy === 'pay'} onClick={() => void run('pay', () => api.admin.recordCardPayment(order.id, { method, reference: payRef.trim() }), t('admin.cards.paymentSaved'))}>{t('admin.cards.recordPayment')}</Button>
        </section>
      )}
      {order.payment && <Alert tone="success">{t('admin.cards.paidOn', { date: formatDateTime(order.payment.paidAt), method: t(`admin.cards.methods.${order.payment.method as 'bank'}`), reference: order.payment.reference })}</Alert>}

      <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <h3 style={{ margin: 0 }}>{t('admin.cards.visual')}</h3>
        <CardPreview design={order.design} url={order.cards[0]?.url ?? url} nfc={order.kind === 'nfc'} />
        <p className="subtle" style={{ margin: 0 }}>{t('admin.cards.visualHelp')}</p>
        {order.designApprovedAt
          ? <Badge tone="success" icon="check-circle">{t('admin.cards.approvedOn', { date: formatDateTime(order.designApprovedAt) })}</Badge>
          : order.designNote && <Alert tone="warning">{t('admin.cards.refusedNote', { note: order.designNote })}</Alert>}
        {writable && ['paid', 'validating'].includes(order.status) && (
          <>
            <Textarea label={t('admin.cards.reviewNote')} optionalLabel={t('admin.cards.optional')} value={note} rows={2} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Button size="sm" variant="gradient" iconLeft="check" loading={busy === 'ok'} onClick={() => void run('ok', () => api.admin.reviewCardDesign(order.id, { approved: true, note }), t('admin.cards.approved'))}>{t('admin.cards.approve')}</Button>
              <Button size="sm" variant="secondary" iconLeft="x" disabled={!note.trim()} loading={busy === 'ko'} onClick={() => void run('ko', () => api.admin.reviewCardDesign(order.id, { approved: false, note }), t('admin.cards.refused'))}>{t('admin.cards.refuse')}</Button>
            </div>
          </>
        )}
      </section>

      <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <h3 style={{ margin: 0 }}>{t('admin.cards.printFiles')}</h3>
        <p className="subtle" style={{ margin: 0 }}>{t('admin.cards.printHelp', { px: `${printPixels().w} × ${printPixels().h}` })}</p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['svg', 'png'] as const).map((f) => <Button key={f} size="sm" variant="secondary" iconLeft="download" loading={busy === `dl-front-${f}-`} onClick={() => void download('front', f)}>{t('admin.cards.front')} {f.toUpperCase()}</Button>)}
        </div>
      </section>

      {writable && !['awaiting_payment', 'delivered', 'canceled'].includes(order.status) && (
        <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <h3 style={{ margin: 0 }}>{t('admin.cards.production')}</h3>
          <div className="cardform__row">
            <Input label={t('admin.cards.partner')} value={partner} maxLength={80} onChange={(e) => setPartner(e.target.value)} />
            <Input label={t('admin.cards.partnerRef')} value={partnerRef} maxLength={80} optionalLabel={t('admin.cards.optional')} onChange={(e) => setPartnerRef(e.target.value)} />
          </div>
          <div><Button size="sm" variant="secondary" loading={busy === 'prod'} onClick={() => void run('prod', () => api.admin.setCardProduction(order.id, { printPartner: partner.trim(), partnerRef: partnerRef.trim() }))}>{t('admin.cards.savePartner')}</Button></div>
        </section>
      )}
      {!writable && order.printPartner && <p className="subtle">{t('admin.cards.partner')} : <strong>{order.printPartner}</strong> {order.partnerRef && `(${order.partnerRef})`}</p>}

      <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <h3 style={{ margin: 0 }}>{t('admin.cards.cardsTitle', { count: order.cards.length })}</h3>
        <ul className="mycards" role="list">
          {order.cards.map((c) => (
            <li key={c.id} className={`mycard ${c.status === 'disabled' ? 'is-off' : ''}`} style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div className="mycard__url">{c.url}</div>
                  <small className="subtle">{t('admin.cards.scans', { count: c.scanCount })}{c.lastScannedAt && ` · ${formatDateTime(c.lastScannedAt)}`}</small>
                </div>
                <div className="mycard__tools">
                  <Badge tone={c.status === 'active' ? 'success' : 'danger'} dot>{c.status === 'active' ? t('admin.cards.active') : t('admin.cards.disabled')}</Badge>
                  <Button size="sm" variant="ghost" iconLeft="download" loading={busy === `dl-back-svg-${c.code}`} onClick={() => void download('back', 'svg', c)}>{t('admin.cards.back')} SVG</Button>
                  <Button size="sm" variant="ghost" iconLeft="download" loading={busy === `dl-back-png-${c.code}`} onClick={() => void download('back', 'png', c)}>{t('admin.cards.back')} PNG</Button>
                  {writable && order.status !== 'canceled' && (
                    <Button size="sm" variant="secondary" loading={busy === `act-${c.id}`} onClick={() => void run(`act-${c.id}`, () => api.admin.setCardActiveByTeam(c.id, c.status !== 'active'))}>{c.status === 'active' ? t('admin.cards.disable') : t('admin.cards.enable')}</Button>
                  )}
                </div>
              </div>
              {c.nfc && <NfcRow key={`${c.id}-${c.nfc.result}-${c.nfc.chipId}`} card={c} order={order} writable={writable} onUpdated={update} />}
            </li>
          ))}
        </ul>
      </section>

      {writable && next.length > 0 && (
        <section style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <h3 style={{ margin: 0 }}>{t('admin.cards.changeStatus')}</h3>
          {next.includes('shipped') && (
            <div className="cardform__row">
              <Input label={t('admin.cards.carrier')} value={carrier} maxLength={60} optionalLabel={t('admin.cards.optional')} onChange={(e) => setCarrier(e.target.value)} />
              <Input label={t('admin.cards.tracking')} value={tracking} maxLength={80} optionalLabel={t('admin.cards.optional')} onChange={(e) => setTracking(e.target.value)} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {next.map((s) => (
              <Button key={s} size="sm" variant={s === 'canceled' ? 'danger' : 'gradient'} loading={busy === `st-${s}`}
                onClick={() => void run(`st-${s}`, () => api.admin.setCardOrderStatus(order.id, { status: s, note: s === 'canceled' ? note : '', carrier, trackingRef: tracking }), t('admin.cards.statusChanged'))}>
                {t(`cards.status.${s}`)}
              </Button>
            ))}
          </div>
          <small className="subtle">{t('admin.cards.statusRules')}</small>
        </section>
      )}
      {!writable && <ReadOnlyNote />}

      <section>
        <h3>{t('admin.cards.history')}</h3>
        <ol className="subtle" style={{ paddingLeft: '1.1rem', margin: 0, display: 'grid', gap: '0.25rem', fontSize: 'var(--text-sm)' }}>
          {[...order.history].reverse().map((h, i) => <li key={i}><strong>{formatDateTime(h.at)}</strong> — {h.event} <em>({h.actor})</em></li>)}
        </ol>
      </section>
    </div>
  );
}

function OrdersTab() {
  const t = useT('admin', 'cards', 'common');
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listCardOrders(query), { sort: 'createdAt', dir: 'desc' });
  const [open, setOpen] = useState<string | null>(null);
  const detail = useResource(() => (open ? api.admin.getCardOrder(open) : Promise.resolve(null)), [open]);
  const cols: Column<AdminCardOrderRow>[] = [
    { key: 'reference', header: t('admin.cards.reference'), sortable: true, primary: true, cell: (o) => <span className="mono">{o.reference}</span> },
    { key: 'customer', header: t('admin.cards.customer'), sortable: true, cell: (o) => o.customer },
    { key: 'kind', header: t('admin.cards.type'), hideOnMobile: true, sortable: true, cell: (o) => (o.kind === 'nfc' ? 'QR + NFC' : 'QR') },
    { key: 'cardsCount', header: t('admin.cards.quantity'), sortable: true, align: 'end', cell: (o) => o.cardsCount },
    { key: 'total', header: t('admin.cards.total'), sortable: true, align: 'end', cell: (o) => formatCurrency(o.total, o.currency) },
    { key: 'status', header: t('admin.cards.status'), sortable: true, cell: (o) => <Badge tone={statusTone(o.status)} dot>{t(`cards.status.${o.status}`)}</Badge> },
    { key: 'createdAt', header: t('admin.cards.date'), sortable: true, hideOnMobile: true, cell: (o) => formatDateTime(o.createdAt) },
  ];
  return (
    <div>
      <div className="adm-filters">
        <SearchBar label={t('common.search')} onSearch={setSearch} />
        <FilterSelect label={t('admin.cards.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={CARD_ORDER_STATUSES.map((s: CardOrderStatus) => ({ value: s, label: t(`cards.status.${s}`) }))} />
        <FilterSelect label={t('admin.cards.type')} value={q.filters?.kind} onChange={(v) => setFilter('kind', v)} options={[{ value: 'qr', label: 'QR' }, { value: 'nfc', label: 'QR + NFC' }]} />
      </div>
      <DataTable caption={t('admin.nav.cards')} columns={cols} rows={res.data?.items} getRowId={(o) => o.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} onRowClick={(o) => setOpen(o.id)} selectedId={open ?? undefined}
        pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined} />
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={detail.data?.reference ?? t('admin.nav.cards')} description={t('admin.cards.detailHelp')} size="lg">
        {detail.status === 'loading' && !detail.data ? <Skeleton height={300} radius={12} /> : detail.status === 'error' ? <ErrorState code={detail.error} onRetry={detail.reload} /> : detail.data && <OrderDetail key={detail.data.id} initial={detail.data} onChanged={res.reload} />}
      </Drawer>
    </div>
  );
}

function PricingTab() {
  const t = useT('admin', 'cards');
  const toast = useToast();
  const writable = useCanWrite('cards');
  const data = useResource(() => api.admin.getCardProducts(), []);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [instructions, setInstructions] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (data.status === 'loading' && !data.data) return <Skeleton height={260} radius={12} />;
  if (data.status === 'error' || !data.data) return <ErrorState code={data.error} onRetry={data.reload} />;
  const products: CardProduct[] = data.data.products;
  const text = instructions ?? data.data.paymentInstructions;

  const save = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      toast.push({ tone: 'success', title: t('admin.cards.saved') });
      data.reload();
    } catch {
      toast.push({ tone: 'error', title: t('admin.actionFailed') });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
      <Alert tone="info">{t('admin.cards.pricingHelp')}</Alert>
      <ul className="mycards" role="list">
        {products.map((p) => {
          const value = prices[p.id] ?? String(p.price);
          const valid = /^\d{1,9}$/.test(value);
          return (
            <li key={p.id} className="mycard">
              <div>
                <strong>{t(`cards.products.${p.id}`)}</strong>
                <div className="subtle">{p.quantity > 1 ? t('admin.cards.packOf', { n: p.quantity }) : t('admin.cards.perCard')} · {p.currency}</div>
              </div>
              <div className="mycard__tools">
                <Input aria-label={`${t('admin.cards.price')} ${t(`cards.products.${p.id}`)}`} type="number" min={0} inputMode="numeric" value={value} disabled={!writable} onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value })} />
                <Button size="sm" variant="secondary" disabled={!writable || !valid || Number(value) === p.price} loading={busy === `p-${p.id}`} onClick={() => void save(`p-${p.id}`, () => api.admin.updateCardProduct(p.id, { price: Number(value) }))}>{t('admin.cards.savePrice')}</Button>
                <Segmented size="sm" label={t('admin.cards.availability')} value={p.active ? 'on' : 'off'} onChange={(v) => void save(`a-${p.id}`, () => api.admin.updateCardProduct(p.id, { active: v === 'on' }))} options={[{ value: 'on', label: t('admin.cards.sold') }, { value: 'off', label: t('admin.cards.notSold') }]} className={!writable ? 'is-disabled' : undefined} />
              </div>
            </li>
          );
        })}
      </ul>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <Textarea label={t('admin.cards.instructions')} hint={t('admin.cards.instructionsHint')} value={text} rows={4} maxLength={800} disabled={!writable} onChange={(e) => setInstructions(e.target.value)} />
        <div><Button variant="gradient" size="sm" disabled={!writable || instructions === null || instructions === data.data.paymentInstructions} loading={busy === 'instr'} onClick={() => void save('instr', () => api.admin.setCardPaymentInstructions(text))}>{t('admin.cards.saveInstructions')}</Button></div>
      </div>
    </div>
  );
}

export default function CardsAdminPage() {
  const t = useT('admin');
  useDocumentTitle(`${t('admin.nav.cards')} · Admin Center`);
  const [tab, setTab] = useState<'orders' | 'pricing'>('orders');
  return (
    <div>
      <PageHeader title={t('admin.nav.cards')} description={t('admin.cards.description')} />
      <Segmented label={t('admin.nav.cards')} value={tab} onChange={setTab} options={[{ value: 'orders', label: t('admin.cards.tabOrders'), icon: 'package' }, { value: 'pricing', label: t('admin.cards.tabPricing'), icon: 'wallet' }]} />
      <div style={{ marginTop: 'var(--space-4)' }}>{tab === 'orders' ? <OrdersTab /> : <PricingTab />}</div>
    </div>
  );
}
