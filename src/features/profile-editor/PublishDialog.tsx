import { useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, Icon, Modal, useToast } from '@/components/ui';
import { pageReadiness } from '@/features/page-engine/document';
import { usernameCandidates } from '@/features/onboarding/compose';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import type { MessageKey } from '@/i18n/types';

const KNOWN_ERRORS = ['username_taken', 'username_invalid', 'username_reserved', 'email_not_verified', 'plan_limit', 'plan_required', 'subscription_required'];

/**
 * Publication : une simple confirmation. S'il manque des champs obligatoires, la liste des blocs à corriger remplace la confirmation.
 * Une fois publié, une alerte « Publication effectuée » propose le lien « Voir ».
 */
export function PublishDialog({ open, onClose, onFocusBlock }: { open: boolean; onClose: () => void; onFocusBlock: (id: string) => void }) {
  const t = useT('editor', 'common');
  const toast = useToast();
  const doc = useEditor((s) => s.doc);
  const setMeta = useEditor((s) => s.setMeta);
  const publish = useEditor((s) => s.publish);
  const saving = useEditor((s) => s.save.state === 'saving');
  const [error, setError] = useState<string | null>(null);

  if (!doc) return null;
  const readiness = pageReadiness({ ...doc, username: doc.username || 'exemple' });
  const update = doc.status === 'published';

  const close = () => { setError(null); onClose(); };

  const submit = async () => {
    setError(null);
    // Une page sans adresse (cas rare) reçoit la première adresse disponible dérivée du nom.
    if (!doc.username) {
      const name = doc.blocks.find((b) => b.type === 'profile');
      let pick = '';
      for (const c of usernameCandidates(name?.type === 'profile' ? name.data.displayName : '')) {
        const r = await api.page.checkUsername(c).catch(() => null);
        if (r?.available) { pick = c; break; }
      }
      if (pick) setMeta({ username: pick });
    }
    const result = await publish();
    if (!result.ok) {
      setError(result.error ?? 'unknown');
      return;
    }
    onClose();
    const username = useEditor.getState().doc?.username ?? doc.username;
    toast.push({ tone: 'success', title: t('editor.publish.doneTitle'), duration: 9000, action: { label: t('editor.publish.view'), href: `/${username}`, icon: 'arrow-right' } });
  };

  if (readiness.incomplete.length > 0) {
    return (
      <Modal open={open} onClose={close} size="md" title={t('editor.publish.checklist')} description={t('editor.publish.missingIntro')}
        footer={<Button variant="secondary" onClick={close}>{t('common.close')}</Button>}>
        <ul role="list" className="publish__issues">
          {readiness.incomplete.map((i) => (
            <li key={i.blockId}>
              <Badge tone="warning" icon="alert">{t(`editor.blocks.${i.type}.label`)}</Badge>
              <span>{t('editor.publish.missingFields')}</span>
              <Button size="sm" variant="ghost" onClick={() => { onFocusBlock(i.blockId); close(); }}>{t('editor.publish.fix')}</Button>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <ConfirmDialog
      open={open} onCancel={close} onConfirm={() => submit()} loading={saving}
      title={update ? t('editor.publish.confirmTitleUpdate') : t('editor.publish.confirmTitle')}
      confirmLabel={t('editor.publish.confirmShort')}
    >
      {error && (
        <Alert tone="danger" title={t('editor.publish.failed')}>
          <Icon name="alert" size={14} /> {t(`editor.publish.errors.${KNOWN_ERRORS.includes(error) ? error : 'unknown'}` as MessageKey)}
        </Alert>
      )}
    </ConfirmDialog>
  );
}
