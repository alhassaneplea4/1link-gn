import { Badge, Card, DataTable, Icon, PageHeader, SearchBar, Skeleton, ErrorState, type Column } from '@/components/ui';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { ADMIN_ROLES, ADMIN_SECTIONS, type Permission } from '@/models/auth';
import type { SecurityEvent } from '@/models/admin';
import { useSession } from '@/state/session';
import { formatDateTime } from '@/utilities/format';
import { FilterSelect, StatusBadge, useAdminList } from '../shared';

export default function AdminSecurityPage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.security')} · Admin Center`);
  const session = useSession((s) => s.session);
  const matrix = useResource(() => api.admin.getRoleMatrix(), []);
  const { q, res, setSearch, setFilter, setPage } = useAdminList((query) => api.admin.listSecurityEvents(query), {});
  const mine = session?.user.adminRole;
  const has = (role: (typeof ADMIN_ROLES)[number], p: Permission) => matrix.data?.[role]?.includes(p) ?? false;
  const cols: Column<SecurityEvent>[] = [
    { key: 'at', header: t('admin.logs.date'), cell: (e) => formatDateTime(e.at) },
    { key: 'kind', header: t('admin.security.event'), primary: true, cell: (e) => t(`admin.security.kinds.${e.kind}`) },
    { key: 'subject', header: t('admin.security.subject'), cell: (e) => e.subject },
    { key: 'level', header: t('admin.logs.level'), align: 'end', cell: (e) => <StatusBadge value={e.level} label={t(`admin.levels.${e.level}`)} /> },
  ];
  return (
    <div className="adm-stack">
      <PageHeader title={t('admin.nav.security')} description={t('admin.security.description')} />
      <Card padding="lg">
        <h2 className="adm-section-title"><Icon name="shield-check" size={18} /> {t('admin.security.yourAccess')}</h2>
        <p className="muted">{t('admin.security.yourAccessText')}</p>
        <div className="adm-chipwrap" style={{ marginTop: 'var(--space-3)' }}>
          {session?.permissions.map((p) => <Badge key={p} tone={p.endsWith('write') ? 'success' : 'info'}>{p}</Badge>)}
        </div>
      </Card>

      <section>
        <h2 className="adm-section-title">{t('admin.security.matrix')}</h2>
        <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>{t('admin.security.matrixText')}</p>
        {matrix.status === 'loading' ? <Skeleton height={260} radius={12} /> : matrix.status === 'error' ? <ErrorState code={matrix.error} onRetry={matrix.reload} compact /> : (
          <div className="roles" role="region" aria-label={t('admin.security.matrix')} tabIndex={0}>
            <table>
              <caption className="sr-only">{t('admin.security.matrix')}</caption>
              <thead><tr><th scope="col">{t('admin.security.section')}</th>{ADMIN_ROLES.map((r) => <th key={r} scope="col" className={r === mine ? 'is-me' : ''}>{t(`common.roles.${r}`)}</th>)}</tr></thead>
              <tbody>
                {ADMIN_SECTIONS.map((s) => (
                  <tr key={s}>
                    <th scope="row">{t(`admin.nav.${s}`)}</th>
                    {ADMIN_ROLES.map((r) => {
                      const rd = has(r, `${s}:read`);
                      const wr = has(r, `${s}:write`);
                      return (
                        <td key={r} className={r === mine ? 'is-me' : ''}>
                          {wr ? <><span className="perm-w"><Icon name="pencil" size={16} /></span><span className="sr-only">{t('admin.security.write')}</span></> : rd ? <><span className="perm-r"><Icon name="eye" size={16} /></span><span className="sr-only">{t('admin.security.read')}</span></> : <><Icon name="minus" size={16} /><span className="sr-only">{t('admin.security.none')}</span></>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ul role="list" className="legend" style={{ marginTop: 'var(--space-3)' }}>
          <li><span className="perm-w"><Icon name="pencil" size={14} /></span> {t('admin.security.write')}</li>
          <li><span className="perm-r"><Icon name="eye" size={14} /></span> {t('admin.security.read')}</li>
          <li><Icon name="minus" size={14} /> {t('admin.security.none')}</li>
        </ul>
      </section>

      <section>
        <h2 className="adm-section-title">{t('admin.security.events')}</h2>
        <div className="adm-filters">
          <SearchBar label={t('common.search')} onSearch={setSearch} />
          <FilterSelect label={t('admin.logs.level')} value={q.filters?.level} onChange={(v) => setFilter('level', v)} options={(['info', 'warning', 'critical'] as const).map((l) => ({ value: l, label: t(`admin.levels.${l}`) }))} />
        </div>
        <DataTable caption={t('admin.security.events')} columns={cols} rows={res.data?.items} getRowId={(e) => e.id} loading={res.status === 'loading' || res.refreshing} error={res.status === 'error' ? res.error : null} onRetry={res.reload}
          pagination={res.data ? { page: res.data.page, pageSize: res.data.pageSize, total: res.data.total, onChange: setPage } : undefined} />
      </section>
    </div>
  );
}
