import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Avatar, Badge, Breadcrumb, Button, Card, ConfirmDialog, DemoBadge, ErrorState, PageHeader, Skeleton, useToast } from '@/components/ui';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { formatDate, formatDateTime, formatNumber } from '@/utilities/format';
import { StatusBadge, useCanWrite } from '../shared';

export default function UserDetailPage() {
  const t = useT('admin', 'common');
  const { id = '' } = useParams();
  const toast = useToast();
  const canWrite = useCanWrite('users');
  const res = useResource(() => api.admin.getUser(id), [id]);
  const [confirm, setConfirm] = useState<'suspend' | 'reinstate' | null>(null);
  const [busy, setBusy] = useState(false);
  const u = res.data;
  useDocumentTitle(u ? `${u.name} · Admin Center` : 'Admin Center');

  const apply = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const out = await api.admin.setUserStatus(id, confirm === 'suspend' ? 'suspended' : 'active');
      toast.push({ tone: out.mode === 'demo' ? 'warning' : 'success', title: confirm === 'suspend' ? t('admin.userDetail.suspended') : t('admin.userDetail.reinstated'), description: out.mode === 'demo' ? t('admin.demoLocalOnly') : undefined });
      res.reload();
    } catch {
      toast.push({ tone: 'error', title: t('admin.actionFailed') });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (res.status === 'loading' && !u) return <Skeleton height={320} radius={16} />;
  if (res.status === 'error' || !u) return <ErrorState code={res.error} onRetry={res.reload} />;
  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: t('admin.nav.users'), to: paths.admin.users }, { label: u.name }]} />}
        title={<span className="cell-type"><Avatar name={u.name} size={44} />{u.name}</span>} badge={<><StatusBadge value={u.status} label={t(`common.status.${u.status}`)} /><DemoBadge /></>}
        description={u.email}
        actions={canWrite ? (u.status === 'suspended' ? <Button variant="secondary" iconLeft="user-check" onClick={() => setConfirm('reinstate')}>{t('admin.userDetail.reinstate')}</Button> : <Button variant="danger" iconLeft="ban" onClick={() => setConfirm('suspend')}>{t('admin.userDetail.suspend')}</Button>) : <Badge tone="neutral" icon="lock">{t('admin.readOnly')}</Badge>}
      />
      <div className="adm-detail">
        <Card padding="lg">
          <h2 className="adm-section-title">{t('admin.userDetail.info')}</h2>
          <dl className="kv">
            <div><dt>{t('admin.users.category')}</dt><dd>{t(`common.categories.${u.category}.label`)}</dd></div>
            <div><dt>{t('admin.users.plan')}</dt><dd>{t(`common.plans.${u.plan}`)}</dd></div>
            <div><dt>{t('admin.users.joined')}</dt><dd>{formatDate(u.createdAt)}</dd></div>
            <div><dt>{t('admin.users.activity')}</dt><dd>{formatDateTime(u.lastActiveAt)}</dd></div>
            <div><dt>{t('admin.userDetail.emailVerified')}</dt><dd>{u.emailVerified ? t('common.yes') : t('common.no')}</dd></div>
            <div><dt>{t('admin.userDetail.country')}</dt><dd>{u.country}</dd></div>
            <div><dt>{t('admin.userDetail.blocks')}</dt><dd>{formatNumber(u.blocksCount)}</dd></div>
            <div><dt>{t('admin.userDetail.views30')}</dt><dd>{formatNumber(u.views30d)}</dd></div>
            <div><dt>{t('admin.userDetail.page')}</dt><dd>{u.username ? <><StatusBadge value={u.pageStatus} label={t(`common.status.${u.pageStatus}`)} /> {u.pageStatus === 'published' && <Link to={`/${u.username}`} target="_blank">@{u.username}</Link>}</> : '—'}</dd></div>
          </dl>
        </Card>
        <Card padding="lg">
          <h2 className="adm-section-title">{t('admin.userDetail.history')}</h2>
          <ol role="list" className="timeline">
            {u.history.map((h, i) => <li key={i}><strong>{h.event}</strong><small>{formatDateTime(h.at)} · {h.actor}</small></li>)}
          </ol>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm !== null} tone={confirm === 'suspend' ? 'danger' : 'primary'} loading={busy} onCancel={() => setConfirm(null)} onConfirm={() => void apply()}
        title={confirm === 'suspend' ? t('admin.userDetail.suspendTitle', { name: u.name }) : t('admin.userDetail.reinstateTitle', { name: u.name })}
        description={confirm === 'suspend' ? t('admin.userDetail.suspendText') : t('admin.userDetail.reinstateText')}
        confirmLabel={confirm === 'suspend' ? t('admin.userDetail.suspend') : t('admin.userDetail.reinstate')}
      >
        <Alert tone="warning">{t('admin.demoLocalOnly')}</Alert>
      </ConfirmDialog>
    </div>
  );
}
