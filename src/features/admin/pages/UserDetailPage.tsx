import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Badge, Breadcrumb, Button, Card, ConfirmDialog, ErrorState, Input, PageHeader, Select, Skeleton, useToast } from '@/components/ui';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { formatDate, formatDateTime, formatNumber } from '@/utilities/format';
import { StatusBadge, useCanWrite } from '../shared';
import { BadgeMark } from '@/components/ui';

export default function UserDetailPage() {
  const t = useT('admin', 'common');
  const { id = '' } = useParams();
  const toast = useToast();
  const canWrite = useCanWrite('users');
  const canBadge = useCanWrite('profiles');
  const canSubscribe = useCanWrite('subscriptions');
  const [sub, setSub] = useState({ planId: 'basic' as 'basic' | 'pro' | 'business', period: 'monthly' as 'monthly' | 'yearly', method: 'mobile_money' as 'mobile_money' | 'card' | 'bank', reference: '' });
  const res = useResource(() => api.admin.getUser(id), [id]);
  const [confirm, setConfirm] = useState<'suspend' | 'reinstate' | null>(null);
  const [busy, setBusy] = useState(false);
  const u = res.data;
  useDocumentTitle(u ? `${u.name} · Admin Center` : 'Admin Center');

  const apply = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.admin.setUserStatus(id, confirm === 'suspend' ? 'suspended' : 'active');
      toast.push({ tone: 'success', title: confirm === 'suspend' ? t('admin.userDetail.suspended') : t('admin.userDetail.reinstated') });
      res.reload();
    } catch {
      toast.push({ tone: 'error', title: t('admin.actionFailed') });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const toggleVerified = async () => {
    if (!u) return;
    setBusy(true);
    try {
      await api.admin.setVerifiedBadge(id, !u.profileVerified);
      toast.push({ tone: 'success', title: u.profileVerified ? t('admin.userDetail.verifiedRevoked') : t('admin.userDetail.verifiedGranted') });
      res.reload();
    } catch {
      toast.push({ tone: 'error', title: t('admin.actionFailed') });
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    setBusy(true);
    try {
      await api.admin.activateSubscription(id, sub);
      toast.push({ tone: 'success', title: t('admin.userDetail.subActivated') });
      setSub((s) => ({ ...s, reference: '' }));
      res.reload();
    } catch {
      toast.push({ tone: 'error', title: t('admin.actionFailed') });
    } finally {
      setBusy(false);
    }
  };

  if (res.status === 'loading' && !u) return <Skeleton height={320} radius={16} />;
  if (res.status === 'error' || !u) return <ErrorState code={res.error} onRetry={res.reload} />;
  return (
    <div>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: t('admin.nav.users'), to: paths.admin.users }, { label: u.name }]} />}
        title={<span className="cell-type"><Avatar name={u.name} size={44} />{u.name}</span>} badge={<><StatusBadge value={u.status} label={t(`common.status.${u.status}`)} /></>}
        description={u.email ?? u.phone ?? ''}
        actions={canWrite ? (u.status === 'suspended' ? <Button variant="secondary" iconLeft="user-check" onClick={() => setConfirm('reinstate')}>{t('admin.userDetail.reinstate')}</Button> : <Button variant="danger" iconLeft="ban" onClick={() => setConfirm('suspend')}>{t('admin.userDetail.suspend')}</Button>) : <Badge tone="neutral" icon="lock">{t('admin.readOnly')}</Badge>}
      />
      <div className="adm-detail">
        <Card padding="lg" data-testid="admin-badges">
          <h2 className="adm-section-title">{t('admin.userDetail.badges')}</h2>
          <p className="muted">{t('admin.userDetail.badgesText')}</p>
          <ul role="list" className="badgelist">
            {u.badges.length === 0 && <li className="muted">{t('admin.userDetail.noBadge')}</li>}
            {u.badges.map((b) => <li key={b} className="badgelist__item is-earned"><BadgeMark badge={b} size={26} /><strong>{t(`common.badges.${b}.label`)}</strong></li>)}
          </ul>
          {canBadge && u.adminRole === null && (
            <Button variant={u.profileVerified ? 'secondary' : 'gradient'} iconLeft="check" loading={busy} onClick={() => void toggleVerified()}>
              {u.profileVerified ? t('admin.userDetail.revokeVerified') : t('admin.userDetail.grantVerified')}
            </Button>
          )}
        </Card>
        <Card padding="lg">
          <h2 className="adm-section-title">{t('admin.userDetail.info')}</h2>
          <dl className="kv">
            <div><dt>{t('admin.users.category')}</dt><dd>{(u.category ? t(`common.categories.${u.category}.label`) : t('admin.categoryNone'))}</dd></div>
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
        {canSubscribe && u.adminRole === null && (
          <Card padding="lg" data-testid="admin-subscription">
            <h2 className="adm-section-title">{t('admin.userDetail.subTitle')}</h2>
            <p className="muted">{t('admin.userDetail.subText')}</p>
            <div className="adm-form">
              <Select label={t('admin.userDetail.subPlan')} value={sub.planId} onChange={(e) => setSub((s) => ({ ...s, planId: e.target.value as typeof s.planId }))}>
                {(['basic', 'pro', 'business'] as const).map((p) => <option key={p} value={p}>{t(`common.plans.${p}`)}</option>)}
              </Select>
              <Select label={t('admin.userDetail.subPeriod')} value={sub.period} onChange={(e) => setSub((s) => ({ ...s, period: e.target.value as typeof s.period }))}>
                <option value="monthly">{t('admin.userDetail.monthly')}</option>
                <option value="yearly">{t('admin.userDetail.yearly')}</option>
              </Select>
              <Select label={t('admin.userDetail.subMethod')} value={sub.method} onChange={(e) => setSub((s) => ({ ...s, method: e.target.value as typeof s.method }))}>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank">{t('admin.userDetail.bank')}</option>
                <option value="card">{t('admin.userDetail.card')}</option>
              </Select>
              <Input label={t('admin.userDetail.subReference')} value={sub.reference} maxLength={80} onChange={(e) => setSub((s) => ({ ...s, reference: e.target.value }))} />
              <Button variant="gradient" iconLeft="check" loading={busy} onClick={() => void activate()}>{t('admin.userDetail.subActivate')}</Button>
            </div>
          </Card>
        )}
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
      </ConfirmDialog>
    </div>
  );
}
