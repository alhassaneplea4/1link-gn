import { Alert, Badge, DataTable, DemoBadge, PageHeader, SearchBar, type Column } from '@/components/ui';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { PaymentRow } from '@/models/admin';
import { formatCurrency, formatDateTime } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList } from '../shared';

export default function PaymentsPage() {
  const t = useT('admin', 'common', 'billing');
  useDocumentTitle(`${t('admin.nav.payments')} · Admin Center`);
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listPayments(query), { sort: 'date', dir: 'desc' });
  const cols: Column<PaymentRow>[] = [
    { key: 'id', header: 'ID', hideOnMobile: true, cell: (p) => <span className="mono">{p.id}</span> },
    { key: 'user', header: t('admin.users.user'), sortable: true, primary: true, cell: (p) => p.user },
    { key: 'plan', header: t('admin.users.plan'), sortable: true, cell: (p) => t(`common.plans.${p.plan}`) },
    { key: 'amount', header: t('billing.sub.amount'), sortable: true, align: 'end', cell: (p) => formatCurrency(p.amount, p.currency) },
    { key: 'method', header: t('admin.payments.method'), hideOnMobile: true, cell: (p) => t(`admin.payments.methods.${p.method}`) },
    { key: 'status', header: t('billing.sub.status'), sortable: true, cell: (p) => <StatusBadge value={p.status} label={t(`billing.sub.invoiceStatus.${p.status}`)} /> },
    { key: 'date', header: t('billing.sub.date'), sortable: true, cell: (p) => formatDateTime(p.date) },
  ];
  return (
    <div>
      <PageHeader title={t('admin.nav.payments')} description={t('admin.payments.description')} badge={<DemoBadge />} />
      <Alert tone="warning" title={t('admin.payments.notConnectedTitle')} className="adm-alert">{t('admin.payments.notConnected')}</Alert>
      <div className="adm-filters" style={{ marginTop: 'var(--space-4)' }}>
        <SearchBar label={t('common.search')} onSearch={setSearch} />
        <FilterSelect label={t('billing.sub.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={(['paid', 'pending', 'failed', 'refunded'] as const).map((s) => ({ value: s, label: t(`billing.sub.invoiceStatus.${s}`) }))} />
        <FilterSelect label={t('admin.payments.method')} value={q.filters?.method} onChange={(v) => setFilter('method', v)} options={(['mobile_money', 'card', 'bank'] as const).map((m) => ({ value: m, label: t(`admin.payments.methods.${m}`) }))} />
      </div>
      <DataTable caption={t('admin.nav.payments')} columns={cols} rows={res.data?.items} getRowId={(p) => p.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined} />
      <p className="subtle" style={{ marginTop: 'var(--space-3)' }}><Badge tone="neutral" icon="info">{t('admin.payments.pendingHint')}</Badge></p>
    </div>
  );
}
