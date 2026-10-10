import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Icon, PageHeader, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { pageShareUrl } from '@/app/configuration/env';
import { useT } from '@/i18n/core';
import type { ModerationDecision } from '@/models/admin';
import { formatDateTime, formatRelative } from '@/utilities/format';
import { StatusBadge, useCanWrite } from '../shared';

const DECISIONS: ModerationDecision[] = ['dismiss', 'warn', 'suspend', 'reinstate'];

/** Poste de modération : file à gauche, dossier à droite. Toute décision sensible passe par une confirmation explicite. */
export default function ModerationPage() {
  const t = useT('admin', 'common', 'pub');
  useDocumentTitle(`${t('admin.nav.moderation')} · Admin Center`);
  const toast = useToast();
  const canWrite = useCanWrite('moderation');
  const [params, setParams] = useSearchParams();
  const queue = useResource(() => api.admin.listReports({ page: 1, pageSize: 30, sort: 'createdAt', dir: 'desc', filters: {} }), []);
  const open = useMemo(() => (queue.data?.items ?? []).filter((r) => r.status === 'open' || r.status === 'in_review'), [queue.data]);
  const selectedId = params.get('report') ?? open[0]?.id ?? null;
  const report = useResource(() => (selectedId ? api.admin.getReport(selectedId) : Promise.resolve(null)), [selectedId]);
  const target = report.data;
  const profile = useResource(() => (target ? api.page.getPublicPage(target.username).catch(() => ({ state: 'unavailable' as const })) : Promise.resolve(null)), [target?.username]);
  const [decision, setDecision] = useState<ModerationDecision>('dismiss');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDecision('dismiss'); setNote(''); }, [selectedId]);

  const apply = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.admin.applyDecision(target.id, decision, note.trim());
      toast.push({ tone: 'success', title: t(`admin.moderation.done.${decision}`) });
      queue.reload();
      report.reload();
    } catch {
      toast.push({ tone: 'error', title: t('admin.actionFailed') });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  const sensitive = decision === 'suspend';

  return (
    <div>
      <PageHeader title={t('admin.nav.moderation')} description={t('admin.moderation.description')} />
      {!canWrite && <Alert tone="info" className="adm-alert">{t('admin.moderation.readOnly')}</Alert>}
      <div className="mod" style={{ marginTop: 'var(--space-4)' }}>
        <Card padding="md" className="mod__queuecard">
          <h2 className="adm-section-title">{t('admin.moderation.queue')} {queue.data && <Badge tone="warning">{open.length}</Badge>}</h2>
          {queue.status === 'loading' ? <Skeleton height={200} radius={12} /> : queue.status === 'error' ? <ErrorState compact code={queue.error} onRetry={queue.reload} /> : open.length === 0 ? <EmptyState compact icon="check-circle" title={t('admin.moderation.queueEmpty')} /> : (
            <ul role="list" className="mod__queue">
              {open.map((r) => (
                <li key={r.id}>
                  <button type="button" className={`mod__item ${r.id === selectedId ? 'is-active' : ''}`} aria-current={r.id === selectedId ? 'true' : undefined} onClick={() => setParams({ report: r.id })}>
                    <span className="mod__item-top"><strong>@{r.username}</strong><StatusBadge value={r.priority} label={t(`admin.priority.${r.priority}`)} /></span>
                    <small>{t(`admin.reasons.${r.reason}`)} · {formatRelative(r.createdAt)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="mod__case">
          {!selectedId ? <Card><EmptyState icon="scale" title={t('admin.moderation.selectTitle')} description={t('admin.moderation.selectText')} /></Card>
            : report.status === 'loading' && !target ? <Skeleton height={320} radius={16} />
            : report.status === 'error' || !target ? <ErrorState code={report.error} onRetry={report.reload} />
            : (
              <>
                <Card padding="lg">
                  <div className="ov-status__top"><StatusBadge value={target.status} label={t(`admin.reportStatus.${target.status}`)} /><StatusBadge value={target.priority} label={t(`admin.priority.${target.priority}`)} /></div>
                  <h2 className="adm-section-title" style={{ marginTop: 'var(--space-3)' }}>@{target.username} — {t(`admin.reasons.${target.reason}`)}</h2>
                  <dl className="kv">
                    <div><dt>{t('admin.moderation.reporter')}</dt><dd>{target.reporter}</dd></div>
                    <div><dt>{t('admin.reports.date')}</dt><dd>{formatDateTime(target.createdAt)}</dd></div>
                  </dl>
                  <h3 style={{ margin: 'var(--space-4) 0 var(--space-2)', fontSize: 'var(--text-sm)' }}>{t('admin.moderation.reportedContent')}</h3>
                  <blockquote className="mod__quote">{target.contentExcerpt}</blockquote>
                </Card>

                <Card padding="lg">
                  <h2 className="adm-section-title">{t('admin.moderation.reviewProfile')}</h2>
                  <div className="mod__preview">
                    {profile.status === 'loading' ? <Skeleton width={240} height={380} radius={32} /> : profile.data && profile.data.state === 'published' ? (
                      <PhoneFrame label={`@${target.username}`}><PageRenderer page={profile.data.page} pageUrl={pageShareUrl(target.username)} preview /></PhoneFrame>
                    ) : <EmptyState compact icon="file" title={t('admin.moderation.noPublicPage')} description={profile.data ? t(`pub.states.${(profile.data.state === 'not_found' ? 'notFound' : profile.data.state) as 'notFound'}.title`) : undefined} />}
                  </div>
                  {profile.data?.state === 'published' && <p style={{ marginTop: 'var(--space-3)' }}><Link to={`/${target.username}`} target="_blank" rel="noopener noreferrer">{t('admin.moderation.openPublic')} <Icon name="external" size={14} /></Link></p>}
                </Card>

                <Card padding="lg">
                  <h2 className="adm-section-title">{t('admin.moderation.history')}</h2>
                  <ol role="list" className="timeline">{target.history.map((h, i) => <li key={i}><strong>{h.event}</strong><small>{formatDateTime(h.at)} · {h.actor}</small></li>)}</ol>
                </Card>

                <Card padding="lg">
                  <h2 className="adm-section-title">{t('admin.moderation.decision')}</h2>
                  <div className="adm-stack">
                    <Select label={t('admin.moderation.decisionLabel')} value={decision} onChange={(e) => setDecision(e.target.value as ModerationDecision)} disabled={!canWrite}>
                      {DECISIONS.map((d) => <option key={d} value={d}>{t(`admin.moderation.decisions.${d}`)}</option>)}
                    </Select>
                    <Textarea label={t('admin.moderation.note')} hint={t('admin.moderation.noteHint')} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={400} showCount disabled={!canWrite} optionalLabel={t('common.optional')} />
                    {sensitive && <Alert tone="warning">{t('admin.moderation.suspendWarning')}</Alert>}
                    <div><Button variant={sensitive ? 'danger' : 'primary'} disabled={!canWrite || (sensitive && note.trim().length < 5)} onClick={() => setConfirm(true)} iconLeft={sensitive ? 'ban' : 'check'}>{t('admin.moderation.prepare')}</Button>{sensitive && note.trim().length < 5 && <p className="field__hint">{t('admin.moderation.noteRequired')}</p>}</div>
                  </div>
                </Card>
              </>
            )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm} tone={sensitive ? 'danger' : 'primary'} loading={busy} onCancel={() => setConfirm(false)} onConfirm={() => void apply()}
        title={t('admin.moderation.confirmTitle', { decision: t(`admin.moderation.decisions.${decision}`) })} description={t('admin.moderation.confirmText', { username: target?.username ?? '' })}
        confirmLabel={t('admin.moderation.confirm')} requireText={sensitive ? target?.username : undefined}
      >
      </ConfirmDialog>
    </div>
  );
}
