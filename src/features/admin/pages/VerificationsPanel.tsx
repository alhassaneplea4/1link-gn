import { useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, DataTable, Drawer, Icon, SearchBar, Textarea, useToast, type Column } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import type { VerificationDecision, VerificationRequest } from '@/models/verification';
import { formatDate, formatDateTime } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList, useCanWrite } from '../shared';

/** File des demandes du badge « Profil vérifié ». La décision appartient à la modération ; elle est tracée et confirmée. */
export default function VerificationsPanel() {
  const t = useT('admin', 'common');
  const toast = useToast();
  const canWrite = useCanWrite('profiles');
  const { q, res, setSearch, setFilter, setPage, setSort } = useAdminList((query) => api.admin.listVerifications(query), { sort: 'createdAt', dir: 'desc', filters: { status: 'pending' } });
  const [selected, setSelected] = useState<VerificationRequest | null>(null);
  const [decision, setDecision] = useState<VerificationDecision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setSelected(null); setDecision(null); setNote(''); };
  const apply = async () => {
    if (!selected || !decision) return;
    setBusy(true);
    try {
      await api.admin.decideVerification(selected.id, decision, note.trim());
      toast.push({ tone: 'success', title: t(`admin.verification.done.${decision}`) });
      close();
      res.reload();
    } catch {
      toast.push({ tone: 'error', title: t('admin.actionFailed') });
    } finally {
      setBusy(false);
    }
  };

  const cols: Column<VerificationRequest>[] = [
    { key: 'username', header: t('admin.verification.applicant'), sortable: true, primary: true, cell: (v) => <span><strong>@{v.username}</strong><br /><small className="subtle">{v.owner}</small></span> },
    { key: 'kind', header: t('admin.verification.kind'), cell: (v) => t(`admin.verification.kinds.${v.kind}`) },
    { key: 'legalName', header: t('admin.verification.legalName'), hideOnMobile: true, cell: (v) => v.legalName },
    { key: 'createdAt', header: t('admin.verification.sent'), sortable: true, hideOnMobile: true, cell: (v) => formatDate(v.createdAt) },
    { key: 'status', header: t('admin.users.status'), sortable: true, cell: (v) => <StatusBadge value={v.status === 'pending' ? 'pending' : v.status === 'approved' ? 'active' : 'suspended'} label={t(`admin.verification.status.${v.status}`)} /> },
  ];

  return (
    <div>
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>{t('admin.verification.description')}</p>
      <div className="adm-filters">
        <SearchBar label={t('common.search')} placeholder={t('admin.verification.searchPlaceholder')} onSearch={setSearch} />
        <FilterSelect label={t('admin.users.status')} value={q.filters?.status} onChange={(v) => setFilter('status', v)} options={(['pending', 'approved', 'rejected'] as const).map((s) => ({ value: s, label: t(`admin.verification.status.${s}`) }))} />
        <FilterSelect label={t('admin.verification.kind')} value={q.filters?.kind} onChange={(v) => setFilter('kind', v)} options={(['person', 'business', 'organization'] as const).map((k) => ({ value: k, label: t(`admin.verification.kinds.${k}`) }))} />
      </div>
      <DataTable
        caption={t('admin.verification.tab')} columns={cols} rows={res.data?.items} getRowId={(v) => v.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
        sort={q.sort ? { key: q.sort, dir: q.dir ?? 'asc' } : undefined} onSort={setSort} onRowClick={setSelected} selectedId={selected?.id}
        pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined}
      />

      <Drawer open={selected !== null && decision === null} onClose={close} title={selected ? `@${selected.username}` : ''} description={selected ? t(`admin.verification.kinds.${selected.kind}`) : undefined} size="md"
        footer={selected?.status === 'pending' && canWrite ? <><Button variant="danger" iconLeft="x" onClick={() => setDecision('reject')}>{t('admin.verification.reject')}</Button><Button variant="gradient" iconLeft="check" onClick={() => setDecision('approve')}>{t('admin.verification.approve')}</Button></> : undefined}>
        {selected && (
          <div className="adm-stack">
            <dl className="kv">
              <div><dt>{t('admin.verification.applicant')}</dt><dd>{selected.owner}</dd></div>
              <div><dt>{t('admin.verification.legalName')}</dt><dd>{selected.legalName}</dd></div>
              {selected.registryNumber && <div><dt>{t('admin.verification.registry')}</dt><dd className="mono">{selected.registryNumber}</dd></div>}
              <div><dt>{t('admin.verification.sent')}</dt><dd>{formatDateTime(selected.createdAt)}</dd></div>
              <div><dt>{t('admin.users.status')}</dt><dd><Badge tone={selected.status === 'approved' ? 'success' : selected.status === 'rejected' ? 'danger' : 'warning'}>{t(`admin.verification.status.${selected.status}`)}</Badge></dd></div>
            </dl>
            <p>
              <a className="btn btn--secondary btn--sm" href={selected.proofUrl} target="_blank" rel="noopener noreferrer nofollow"><Icon name="external" size={16} /><span className="btn__label">{t('admin.verification.openProof')}</span></a>
              <a className="btn btn--ghost btn--sm" href={`/${selected.username}`} target="_blank" rel="noopener noreferrer"><span className="btn__label">{t('admin.moderation.openPublic')}</span></a>
            </p>
            <p className="subtle">{t('admin.verification.proofWarning')}</p>
            {selected.note && <blockquote className="mod__quote">{selected.note}</blockquote>}
            {selected.decisionNote && <Alert tone={selected.status === 'rejected' ? 'danger' : 'info'} title={t('admin.verification.decisionNote')}>{selected.decisionNote}</Alert>}
            {selected.status === 'pending' && !canWrite && <Badge tone="neutral" icon="lock">{t('admin.readOnly')}</Badge>}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={decision !== null} tone={decision === 'reject' ? 'danger' : 'primary'} loading={busy} onCancel={() => setDecision(null)} onConfirm={() => void apply()}
        title={decision === 'approve' ? t('admin.verification.confirmApprove', { name: selected?.legalName ?? '' }) : t('admin.verification.confirmReject', { name: selected?.legalName ?? '' })}
        description={decision === 'approve' ? t('admin.verification.approveText') : t('admin.verification.rejectText')}
        confirmLabel={decision === 'approve' ? t('admin.verification.approve') : t('admin.verification.reject')}
        confirmDisabled={decision === 'reject' && note.trim().length < 5}
      >
        <Textarea label={t('admin.verification.note')} hint={decision === 'reject' ? t('admin.verification.noteRequired') : t('admin.verification.noteOptional')} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={300} showCount />
        {decision === 'reject' && note.trim().length < 5 && <p className="field__hint">{t('admin.verification.noteRequired')}</p>}
      </ConfirmDialog>
    </div>
  );
}
