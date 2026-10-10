import { Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/services/api';
import { env } from '@/app/configuration/env';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { StatusBadge } from '../shared';

export default function SystemPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.system')} · Admin Center`);
  const res = useResource(() => api.admin.getSystemStatus(), []);
  return (
    <div className="adm-stack">
      <PageHeader title={t('admin.nav.system')} description={t('admin.system.description')} />
      {res.status === 'loading' ? <Skeleton height={200} radius={12} /> : res.status === 'error' ? <ErrorState code={res.error} onRetry={res.reload} /> : (
        <ul role="list" className="svc">
          {res.data?.map((s) => (
            <li key={s.id}>
              <span className="svc__top"><strong>{s.name}</strong><StatusBadge value={s.status} label={t(`admin.system.status.${s.status}`)} /></span>
              <small className="subtle">{s.latencyMs != null ? t('admin.system.latency', { ms: s.latencyMs }) : t('admin.system.noMeasure')}</small>
              {s.note && <small className="subtle">{s.note}</small>}
            </li>
          ))}
        </ul>
      )}
      <Card padding="lg">
        <h2 className="adm-section-title">{t('admin.system.frontend')}</h2>
        <dl className="kv">
          <div><dt>{t('admin.system.apiBase')}</dt><dd className="mono">{env.apiBaseUrl}</dd></div>
          <div><dt>{t('admin.system.realtime')}</dt><dd>{api.realtime.kind}</dd></div>
          <div><dt>{t('admin.system.domain')}</dt><dd className="mono">{env.publicDomain || window.location.host}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
