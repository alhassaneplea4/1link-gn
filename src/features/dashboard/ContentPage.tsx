import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, DataTable, EmptyState, ErrorState, Icon, IconButton, PageHeader, SearchBar, Segmented, Skeleton, type Column } from '@/components/ui';
import { AddBlockDialog } from '@/features/profile-editor/AddBlockDialog';
import { BLOCK_GROUPS, blockRegistry, blockSummary, isBlockComplete } from '@/features/page-engine/blocks/registry';
import type { BlockGroup } from '@/features/page-engine/blocks/types';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { AnyBlock } from '@/models/blocks';
import { useEditor, useEditorBlocks } from '@/state/editor';
import { formatRelative } from '@/utilities/format';
import './dashboard.css';

/** Vue « liste » de tous les contenus de la page (liens, services, contacts…) : filtre, recherche, accès direct à l'édition. */
export default function ContentPage() {
  const t = useT('dashboard', 'editor', 'common');
  useDocumentTitle(`${t('dashboard.nav.content')} · 1Link`);
  const navigate = useNavigate();
  const status = useEditor((s) => s.status);
  const blocks = useEditorBlocks();
  const [group, setGroup] = useState<BlockGroup | 'all'>('all');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'updatedAt', dir: 'desc' });

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const list = blocks.filter((b) => (group === 'all' || blockRegistry[b.type].group === group) && (!q || `${blockSummary(b)} ${t(`editor.blocks.${b.type}.label`)}`.toLowerCase().includes(q)));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const av = sort.key === 'type' ? a.type : sort.key === 'summary' ? blockSummary(a) : a.updatedAt ?? '';
      const bv = sort.key === 'type' ? b.type : sort.key === 'summary' ? blockSummary(b) : b.updatedAt ?? '';
      return av.localeCompare(bv) * dir;
    });
  }, [blocks, group, query, sort, t]);

  const edit = (b: AnyBlock) => { useEditor.getState().select(b.id); navigate(paths.dashboard.page); };

  const columns: Column<AnyBlock>[] = [
    { key: 'type', header: t('dashboard.content.type'), sortable: true, primary: true, cell: (b) => <span className="cell-type"><span className="recent__icon"><Icon name={blockRegistry[b.type].icon} size={16} /></span>{t(`editor.blocks.${b.type}.label`)}</span> },
    { key: 'summary', header: t('dashboard.content.summary'), sortable: true, cell: (b) => <span className="truncate cell-summary">{blockSummary(b) || '—'}</span> },
    { key: 'status', header: t('dashboard.content.status'), cell: (b) => (
      <span className="cell-badges">
        <Badge tone={b.visible ? 'success' : 'neutral'} dot>{b.visible ? t('dashboard.content.visible') : t('editor.list.hidden')}</Badge>
        {!isBlockComplete(b) && <Badge tone="warning" icon="alert">{t('editor.list.incomplete')}</Badge>}
      </span>
    ) },
    { key: 'updatedAt', header: t('dashboard.content.updated'), sortable: true, hideOnMobile: true, cell: (b) => (b.updatedAt ? formatRelative(b.updatedAt) : '—') },
    { key: 'actions', header: <span className="sr-only">{t('common.actions')}</span>, mobileLabel: t('common.actions'), align: 'end', cell: (b) => (
      <span className="cell-actions">
        <IconButton size="sm" icon={b.visible ? 'eye' : 'eye-off'} label={b.visible ? t('editor.list.hide') : t('editor.list.show')} onClick={(e) => { e.stopPropagation(); useEditor.getState().toggleVisible(b.id); }} />
        <Button size="sm" variant="secondary" iconLeft="pencil" onClick={(e) => { e.stopPropagation(); edit(b); }}>{t('common.edit')}</Button>
      </span>
    ) },
  ];

  if (status === 'loading' || status === 'idle') return <Skeleton height={300} radius={16} />;
  if (status === 'error') return <ErrorState onRetry={() => void useEditor.getState().load({ force: true })} />;

  return (
    <div>
      <PageHeader title={t('dashboard.nav.content')} description={t('dashboard.content.description')} actions={<Button variant="gradient" iconLeft="plus" onClick={() => setAddOpen(true)}>{t('editor.list.addBlock')}</Button>} />
      <div className="content-toolbar">
        <Segmented label={t('dashboard.content.filter')} value={group} onChange={setGroup} options={[{ value: 'all', label: t('common.all') }, ...BLOCK_GROUPS.map((g) => ({ value: g, label: t(`editor.picker.groups.${g}`) }))]} />
        <SearchBar label={t('common.search')} placeholder={t('dashboard.content.searchPlaceholder')} onSearch={setQuery} className="content-toolbar__search" />
      </div>
      <DataTable
        caption={t('dashboard.nav.content')} columns={columns} rows={rows} getRowId={(b) => b.id}
        sort={sort} onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))} onRowClick={edit}
        empty={<EmptyState icon="layers" title={t('dashboard.content.emptyTitle')} description={t('dashboard.content.emptyText')} action={<Button iconLeft="plus" onClick={() => setAddOpen(true)}>{t('editor.list.addBlock')}</Button>} />}
      />
      <AddBlockDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => navigate(paths.dashboard.page)} />
    </div>
  );
}
