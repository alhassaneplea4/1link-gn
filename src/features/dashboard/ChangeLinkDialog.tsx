import { useEffect, useState } from 'react';
import { Alert, Button, Icon, Input, Modal, useToast } from '@/components/ui';
import { env, publicUrl } from '@/app/configuration/env';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import { useEditor } from '@/state/editor';
import { slugifyUsername, validateUsername } from '@/utilities/validation';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid';

/**
 * Modifier l'adresse 1Link (le lien de la page). Deux temps : choisir une adresse libre, puis confirmer — l'ancienne adresse
 * cesse aussitôt de fonctionner (les liens déjà partagés ne redirigent pas), d'où la confirmation explicite.
 */
export function ChangeLinkDialog({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const t = useT('dashboard', 'editor', 'common');
  const toast = useToast();
  const [value, setValue] = useState(current);
  const [avail, setAvail] = useState<Availability>('idle');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setValue(current); setStep('edit'); setError(null); setAvail('idle'); }
  }, [open, current]);

  // Disponibilité (temporisée), alignée sur la règle serveur.
  useEffect(() => {
    if (!open || step !== 'edit') return;
    const local = validateUsername(value);
    if (local) { setAvail(value ? (local === 'common.validation.usernameReserved' ? 'reserved' : 'invalid') : 'idle'); return; }
    if (value === current) { setAvail('idle'); return; }
    setAvail('checking');
    let live = true;
    const id = setTimeout(() => {
      api.page.checkUsername(value).then((r) => live && setAvail(r.available ? 'available' : r.reason === 'reserved' ? 'reserved' : 'taken'), () => live && setAvail('idle'));
    }, 350);
    return () => { live = false; clearTimeout(id); };
  }, [value, current, open, step]);

  const message: Record<Availability, string | undefined> = {
    idle: undefined, checking: undefined, available: undefined,
    taken: t('editor.publish.taken'), reserved: t('common.validation.usernameReserved'), invalid: t('common.validation.usernameFormat'),
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.page.changeUsername(value);
      await useEditor.getState().load({ force: true });
      toast.push({ tone: 'success', title: t('dashboard.overview.link.done'), action: { label: t('editor.publish.view'), href: `/${value}`, icon: 'arrow-right' } });
      onClose();
    } catch (e) {
      setError(isApiError(e) && e.message === 'username_taken' ? t('editor.publish.taken') : isApiError(e) && e.code === 'rate_limited' ? t('dashboard.overview.link.tooMany') : t('dashboard.overview.link.failed'));
      setStep('edit');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open} onClose={busy ? () => undefined : onClose} size="sm" title={step === 'edit' ? t('dashboard.overview.link.title') : t('dashboard.overview.link.confirmTitle')}
      description={step === 'edit' ? t('dashboard.overview.link.text') : undefined}
      footer={step === 'edit' ? (
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="gradient" disabled={avail !== 'available'} onClick={() => setStep('confirm')}>{t('common.continue')}</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setStep('edit')} disabled={busy}>{t('common.back')}</Button>
          <Button variant="danger" loading={busy} onClick={() => void confirm()}>{t('dashboard.overview.link.confirm')}</Button>
        </>
      )}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {step === 'edit' ? (
        <Input
          label={t('editor.publish.username')} value={value} onChange={(e) => setValue(slugifyUsername(e.target.value))} prefix={`${env.publicDomain}/`} autoComplete="off" spellCheck={false} data-autofocus=""
          hint={avail === 'available' ? undefined : t('editor.publish.usernameHint')} error={message[avail]}
          suffix={avail === 'checking' ? <span className="spinner" style={{ width: 14, height: 14 }} aria-label={t('editor.publish.checking')} /> : avail === 'available' ? <Icon name="check-circle" size={18} label={t('editor.publish.available')} /> : undefined}
        />
      ) : (
        <div className="link-change">
          <p className="mono link-change__old"><s>{publicUrl(current)}</s></p>
          <p className="mono link-change__new"><Icon name="arrow-right" size={14} /> {publicUrl(value)}</p>
          <Alert tone="warning">{t('dashboard.overview.link.warning')}</Alert>
        </div>
      )}
    </Modal>
  );
}
