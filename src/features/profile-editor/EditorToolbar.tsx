import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { Badge, Button, ConfirmDialog, Icon, IconButton, Modal } from '@/components/ui';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { pageShareUrl } from '@/app/configuration/env';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { formatRelative } from '@/utilities/format';
import { PublishDialog } from './PublishDialog';

/** Raccourcis : Ctrl/Cmd+S enregistre le brouillon, Ctrl/Cmd+Z annule, Ctrl/Cmd+Maj+Z (ou Y) rétablit. */
function useEditorShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const k = e.key.toLowerCase();
      const st = useEditor.getState();
      if (k === 's') { e.preventDefault(); void st.saveDraft(); }
      else if (k === 'z' && !typing) { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); }
      else if (k === 'y' && !typing) { e.preventDefault(); st.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Prévient avant de quitter avec des modifications non enregistrées (navigation interne + fermeture d'onglet). */
function useUnsavedGuard() {
  const dirty = useEditor((s) => s.dirty);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  return blocker;
}

export function SaveIndicator() {
  const t = useT('editor');
  const dirty = useEditor((s) => s.dirty);
  const save = useEditor((s) => s.save);
  const saveDraft = useEditor((s) => s.saveDraft);
  const load = useEditor((s) => s.load);
  if (save.state === 'error' && save.fieldError === 'version_conflict') {
    return <span className="savestate is-error" role="alert"><Icon name="alert" size={16} /> {t('editor.toolbar.conflict')} <button type="button" className="linklike" onClick={() => void load({ force: true })}>{t('editor.toolbar.reload')}</button></span>;
  }
  if (save.state === 'saving') return <span className="savestate" role="status"><span className="spinner" style={{ width: 14, height: 14 }} /> {t('editor.toolbar.saving')}</span>;
  if (save.state === 'error') return <span className="savestate is-error" role="alert"><Icon name="alert" size={16} /> {t('editor.toolbar.saveError')} <button type="button" className="linklike" onClick={() => void saveDraft()}>{t('common.retry')}</button></span>;
  if (dirty) return <span className="savestate is-dirty" role="status"><Icon name="dot" size={14} /> {t('editor.toolbar.unsaved')}</span>;
  if (save.state === 'saved' && save.at) return <span className="savestate is-saved" role="status"><Icon name="check" size={16} /> {t('editor.toolbar.saved')} · {formatRelative(save.at)}</span>;
  return <span className="savestate subtle">{t('editor.toolbar.upToDate')}</span>;
}

export function EditorToolbar({ onFocusBlock, forceErrors }: { onFocusBlock: (id: string) => void; forceErrors?: () => void }) {
  const t = useT('editor', 'common');
  useEditorShortcuts();
  const blocker = useUnsavedGuard();
  const doc = useEditor((s) => s.doc);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const saving = useEditor((s) => s.save.state === 'saving');
  const { undo, redo, saveDraft } = useEditor.getState();
  const entitlements = useSession((s) => s.session?.entitlements);
  const [publishOpen, setPublishOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!doc) return null;
  const unpublished = doc.status === 'published' && doc.publishedAt && doc.updatedAt > doc.publishedAt;

  return (
    <>
      <div className="etoolbar" role="toolbar" aria-label={t('editor.toolbar.label')}>
        <div className="etoolbar__group">
          <IconButton icon="undo" label={t('editor.toolbar.undo')} disabled={!canUndo} onClick={undo} />
          <IconButton icon="redo" label={t('editor.toolbar.redo')} disabled={!canRedo} onClick={redo} />
        </div>
        <div className="etoolbar__status">
          <Badge tone={doc.status === 'published' ? 'success' : 'neutral'} dot>{doc.status === 'published' ? t('common.status.published') : t('common.status.draft')}</Badge>
          {unpublished && <Badge tone="warning">{t('editor.toolbar.unpublishedChanges')}</Badge>}
          <SaveIndicator />
        </div>
        <div className="etoolbar__group etoolbar__group--end">
          {entitlements && <span className="etoolbar__count subtle">{t('editor.toolbar.blockCount', { n: doc.blocks.length, max: entitlements.maxBlocks })}</span>}
          <Button variant="ghost" iconLeft="eye" onClick={() => setPreviewOpen(true)} className="etoolbar__preview">{t('common.preview')}</Button>
          <Button variant="secondary" iconLeft="save" className="etoolbar__save" onClick={() => void saveDraft()} loading={saving} disabled={!dirty && doc.id !== ''}>{t('editor.toolbar.saveDraft')}</Button>
          <Button variant="gradient" iconLeft="rocket" onClick={() => { forceErrors?.(); setPublishOpen(true); }}>{doc.status === 'published' ? t('editor.toolbar.update') : t('editor.toolbar.publish')}</Button>
        </div>
      </div>

      <PublishDialog open={publishOpen} onClose={() => setPublishOpen(false)} onFocusBlock={onFocusBlock} />

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={t('editor.preview.title')} description={t('editor.preview.description')} size="md">
        <div className="preview-modal">
          <PhoneFrame label={t('editor.preview.title')}>
            <PageRenderer page={doc} pageUrl={pageShareUrl(doc.username || 'exemple')} preview layout="profile" branding={!entitlements?.removeBranding} />
          </PhoneFrame>
        </div>
      </Modal>

      <ConfirmDialog
        open={blocker.state === 'blocked'} tone="danger" title={t('editor.leave.title')} description={t('editor.leave.text')}
        confirmLabel={t('editor.leave.confirm')} cancelLabel={t('editor.leave.stay')}
        onCancel={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}
