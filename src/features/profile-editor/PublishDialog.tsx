import { isContactVerified } from '@/models/auth';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Icon, Input, Modal, Textarea } from '@/components/ui';
import { pageReadiness } from '@/features/page-engine/document';
import { ShareDialog } from '@/features/sharing/ShareDialog';
import { api } from '@/services/api';
import { env, publicUrl } from '@/app/configuration/env';
import { paths } from '@/app/configuration/paths';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { slugifyUsername, validateUsername } from '@/utilities/validation';
import type { MessageKey } from '@/i18n/types';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid';

/** Préparation de la publication : prérequis, adresse, métadonnées de partage, puis confirmation. */
export function PublishDialog({ open, onClose, onFocusBlock }: { open: boolean; onClose: () => void; onFocusBlock: (id: string) => void }) {
  const t = useT('editor', 'common');
  const doc = useEditor((s) => s.doc);
  const setMeta = useEditor((s) => s.setMeta);
  const publish = useEditor((s) => s.publish);
  const saving = useEditor((s) => s.save.state === 'saving');
  const verified = useSession((s) => (s.session ? isContactVerified(s.session.user) : false));
  const [username, setUsername] = useState(doc?.username ?? '');
  const [avail, setAvail] = useState<Availability>('idle');
  const [result, setResult] = useState<{ ok: boolean; mode?: 'demo' | 'live'; error?: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername(doc?.username ?? '');
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Vérification de disponibilité (temporisée), alignée sur la règle serveur.
  useEffect(() => {
    if (!open) return;
    const local = validateUsername(username);
    if (local) {
      setAvail(username ? (local === 'common.validation.usernameReserved' ? 'reserved' : 'invalid') : 'idle');
      return;
    }
    if (username === doc?.username && doc?.status === 'published') {
      setAvail('available');
      return;
    }
    setAvail('checking');
    let live = true;
    const id = setTimeout(() => {
      api.page.checkUsername(username).then((r) => live && setAvail(r.available ? 'available' : (r.reason ?? 'taken') === 'reserved' ? 'reserved' : 'taken'), () => live && setAvail('idle'));
    }, 350);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [username, open, doc?.username, doc?.status]);

  if (!doc) return null;
  const readiness = pageReadiness({ ...doc, username: username || doc.username });
  const canPublish = readiness.incomplete.length === 0 && avail === 'available' && verified && !saving;
  const availMsg: Record<Availability, string | undefined> = {
    idle: undefined, checking: t('editor.publish.checking'), available: undefined,
    taken: t('editor.publish.taken'), reserved: t('common.validation.usernameReserved'), invalid: t('common.validation.usernameFormat'),
  };

  const submit = async () => {
    setMeta({ username });
    // setMeta est synchrone : le store contient désormais l'adresse choisie.
    setResult(await publish());
  };

  if (result?.ok) {
    return (
      <>
        <Modal open={open && !shareOpen} onClose={onClose} title={t('editor.publish.doneTitle')} size="sm"
          footer={<><Button variant="secondary" onClick={onClose}>{t('common.close')}</Button><Button iconLeft="share" onClick={() => setShareOpen(true)}>{t('editor.publish.share')}</Button></>}>
          <div className="publish-done">
            <p className="mono publish-done__url">{publicUrl(doc.username)}</p>
            <Alert tone="success">{t('editor.publish.liveText')}</Alert>
            <a className="btn btn--secondary btn--md" href={`/${doc.username}`} target="_blank" rel="noopener noreferrer"><span className="btn__label">{t('editor.publish.viewPage')}</span><Icon name="external" size={16} /></a>
          </div>
        </Modal>
        <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} username={doc.username} published />
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={doc.status === 'published' ? t('editor.publish.titleUpdate') : t('editor.publish.title')} description={t('editor.publish.description')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="gradient" iconLeft="rocket" disabled={!canPublish} loading={saving} onClick={() => void submit()}>{doc.status === 'published' ? t('editor.publish.confirmUpdate') : t('editor.publish.confirm')}</Button></>}>
      <div className="publish">
        {!verified && (
          <Alert tone="warning" title={t('editor.publish.unverifiedTitle')} action={<Link className="btn btn--secondary btn--sm" to={paths.verifyEmail}><span className="btn__label">{t('editor.publish.verifyNow')}</span></Link>}>
            {t('editor.publish.unverifiedText')}
          </Alert>
        )}
        {result && !result.ok && <Alert tone="danger" title={t('editor.publish.failed')}>{result.error && /^[a-z_]+$/.test(result.error) ? t(`editor.publish.errors.${result.error in { username_taken: 1, username_invalid: 1, username_reserved: 1, email_not_verified: 1, plan_limit: 1 } ? result.error : 'unknown'}` as MessageKey) : t('editor.publish.errors.unknown')}</Alert>}

        <section aria-labelledby="pub-check">
          <h3 id="pub-check" className="publish__h">{t('editor.publish.checklist')}</h3>
          {readiness.incomplete.length === 0 ? (
            <p className="publish__ok"><Icon name="check-circle" size={18} /> {t('editor.publish.allGood')}</p>
          ) : (
            <ul role="list" className="publish__issues">
              {readiness.incomplete.map((i) => (
                <li key={i.blockId}>
                  <Badge tone="warning" icon="alert">{t(`editor.blocks.${i.type}.label`)}</Badge>
                  <span>{t('editor.publish.missingFields')}</span>
                  <Button size="sm" variant="ghost" onClick={() => { onFocusBlock(i.blockId); onClose(); }}>{t('editor.publish.fix')}</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="publish__fields">
          <Input label={t('editor.publish.username')} value={username} onChange={(e) => setUsername(slugifyUsername(e.target.value))} prefix={`${env.publicDomain}/`} autoComplete="off" spellCheck={false}
            hint={avail === 'available' ? undefined : t('editor.publish.usernameHint')} error={availMsg[avail] && avail !== 'checking' ? availMsg[avail] : undefined}
            suffix={avail === 'checking' ? <span className="spinner" style={{ width: 14, height: 14 }} aria-label={t('editor.publish.checking')} /> : avail === 'available' ? <Icon name="check-circle" size={18} label={t('editor.publish.available')} /> : undefined} />
          <Input label={t('editor.publish.shareTitle')} hint={t('editor.publish.shareHint')} value={doc.share.title} maxLength={70} optionalLabel={t('common.optional')}
            onChange={(e) => setMeta({ share: { ...doc.share, title: e.target.value } })} />
          <Textarea label={t('editor.publish.shareDescription')} value={doc.share.description} maxLength={160} rows={2} showCount optionalLabel={t('common.optional')}
            onChange={(e) => setMeta({ share: { ...doc.share, description: e.target.value } })} />
        </section>
      </div>
    </Modal>
  );
}
