import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ConfirmDialog, ErrorState, PageHeader, Button, Segmented, Skeleton, Tabs, useToast } from '@/components/ui';
import { EditorToolbar } from '@/features/profile-editor/EditorToolbar';
import { LivePreview } from '@/features/profile-editor/EditorPage';
import { useDocumentTitle, useIsDesktop } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { useAccess } from '@/hooks/useAccess';
import { PlanGateNotice } from '@/features/subscriptions/PlanNotice';
import { minimumPlanFor, type AppearanceTab } from '@/models/access';
import { ButtonsPanel, BackgroundPanel, ColorsPanel, LayoutPanel, ThemesPanel, TypographyPanel } from './panels';
import '@/features/profile-editor/editor.css';
import './appearance.css';

export default function AppearancePage() {
  const t = useT('appearance', 'editor', 'common');
  useDocumentTitle(`${t('appearance.title')} · 1Link`);
  const toast = useToast();
  const status = useEditor((s) => s.status);
  const loadError = useEditor((s) => s.loadError);
  const a = useEditor((s) => s.doc?.appearance);
  const patch = useEditor((s) => s.patchAppearance);
  const [view, setView] = useState<'settings' | 'preview'>('settings');
  const [confirmReset, setConfirmReset] = useState(false);
  const desktop = useIsDesktop();
  const { rights } = useAccess();
  useEffect(() => void useEditor.getState().load(), []);
  const noop = useCallback(() => undefined, []);

  if (status === 'error') return <ErrorState code={loadError} onRetry={() => void useEditor.getState().load({ force: true })} />;
  if (!a) return <Skeleton height={360} radius={16} />;

  // Un onglet fermé à l'offre reste visible (cadenas) mais ses réglages ne sont pas proposés : le serveur refuse de toute façon ces modifications.
  const tab = (id: string, access: AppearanceTab, label: string, icon: 'sparkles' | 'palette' | 'click' | 'type' | 'grid' | 'image', panel: ReactNode) => {
    const open = rights.tabs.includes(access);
    return { id, label, icon: open ? icon : ('lock' as const), panel: open ? panel : <PlanGateNotice plan={minimumPlanFor((r) => r.tabs.includes(access))} /> };
  };
  const panels = (
    <Tabs
      variant="pills" label={t('appearance.sections')}
      items={[
        tab('themes', 'themes', t('appearance.tabs.themes'), 'sparkles', <ThemesPanel a={a} />),
        tab('colors', 'colors', t('appearance.tabs.colors'), 'palette', <ColorsPanel a={a} patch={patch} />),
        tab('buttons', 'buttons', t('appearance.tabs.buttons'), 'click', <ButtonsPanel a={a} patch={patch} />),
        tab('type', 'text', t('appearance.tabs.type'), 'type', <TypographyPanel a={a} patch={patch} />),
        tab('layout', 'layout', t('appearance.tabs.layout'), 'grid', <LayoutPanel a={a} patch={patch} />),
        tab('background', 'background', t('appearance.tabs.background'), 'image', <BackgroundPanel a={a} patch={patch} />),
      ]}
    />
  );

  return (
    <div className="editor">
      <PageHeader
        title={t('appearance.title')} description={t('appearance.subtitle')}
        actions={<Button variant="secondary" iconLeft="reset" onClick={() => setConfirmReset(true)}>{t('appearance.reset')}</Button>}
      />
      <EditorToolbar onFocusBlock={noop} />
      {!desktop && <Segmented label={t('editor.tabs.label')} value={view} onChange={setView} className="editor__tabs" options={[{ value: 'settings', label: t('appearance.settings'), icon: 'sliders' }, { value: 'preview', label: t('editor.tabs.preview'), icon: 'smartphone' }]} />}
      <div className="editor__grid appearance__grid">
        {(desktop || view === 'settings') && <div className="appearance__panel">{panels}</div>}
        {(desktop || view === 'preview') && <aside className="editor__right" aria-label={t('editor.preview.title')}><div className="editor__sticky"><LivePreview /></div></aside>}
      </div>
      <ConfirmDialog
        open={confirmReset} tone="danger" onCancel={() => setConfirmReset(false)} title={t('appearance.resetTitle')} description={t('appearance.resetText')} confirmLabel={t('appearance.reset')}
        onConfirm={() => { useEditor.getState().resetAppearance(); setConfirmReset(false); toast.push({ tone: 'success', title: t('appearance.resetDone'), description: t('appearance.resetUndo') }); }}
      />
    </div>
  );
}
