import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ErrorState, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { pageShareUrl } from '@/app/configuration/env';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle, useIsDesktop } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { AddBlockDialog } from './AddBlockDialog';
import { BlockList } from './BlockList';
import { EditorToolbar } from './EditorToolbar';
import './editor.css';

/** Aperçu en direct : suit le bloc sélectionné en le faisant défiler dans le cadre du téléphone. */
export function LivePreview() {
  const t = useT('editor');
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedId);
  const branding = useSession((s) => !s.session?.entitlements.removeBranding);
  const screen = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    const el = screen.current?.querySelector<HTMLElement>(`[data-block-id="${selectedId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selectedId]);
  if (!doc) return null;
  return (
    <PhoneFrame ref={screen} label={t('editor.preview.title')}>
      <PageRenderer page={doc} pageUrl={pageShareUrl(doc.username || 'exemple')} preview branding={branding} highlightBlockId={selectedId} />
    </PhoneFrame>
  );
}

export default function EditorPage() {
  const t = useT('editor', 'common');
  useDocumentTitle(`${t('editor.title')} · 1Link`);
  const status = useEditor((s) => s.status);
  const loadError = useEditor((s) => s.loadError);
  const doc = useEditor((s) => s.doc);
  const [addOpen, setAddOpen] = useState(false);
  const [forceErrors, setForceErrors] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const desktop = useIsDesktop();
  const select = useEditor((s) => s.select);

  useEffect(() => void useEditor.getState().load(), []);

  const focusBlock = useCallback((id: string) => {
    setTab('edit');
    select(id);
    requestAnimationFrame(() => document.querySelector(`[data-flip-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }, [select]);

  if (status === 'error') return <ErrorState code={loadError} onRetry={() => void useEditor.getState().load({ force: true })} />;
  if (status !== 'ready' && status !== 'idle' || !doc) {
    if (status === 'ready' && !doc) return <Navigate to={paths.onboarding} replace />;
    return (
      <div aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton height={40} width="40%" /><div style={{ height: 24 }} /><Skeleton height={64} /><div style={{ height: 12 }} /><Skeleton height={64} /><div style={{ height: 12 }} /><Skeleton height={64} />
      </div>
    );
  }

  return (
    <div className="editor">
      <PageHeader title={t('editor.title')} description={t('editor.subtitle')} />
      <EditorToolbar onFocusBlock={focusBlock} forceErrors={() => setForceErrors(true)} />
      {!desktop && <Segmented label={t('editor.tabs.label')} value={tab} onChange={setTab} options={[{ value: 'edit', label: t('editor.tabs.edit'), icon: 'pencil' }, { value: 'preview', label: t('editor.tabs.preview'), icon: 'smartphone' }]} className="editor__tabs" />}
      <div className="editor__grid">
        {(desktop || tab === 'edit') && (
          <div className="editor__left">
            <BlockList forceErrors={forceErrors} onAdd={() => setAddOpen(true)} />
          </div>
        )}
        {(desktop || tab === 'preview') && (
          <aside className="editor__right" aria-label={t('editor.preview.title')}>
            <div className="editor__sticky"><LivePreview /></div>
          </aside>
        )}
      </div>
      <AddBlockDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
