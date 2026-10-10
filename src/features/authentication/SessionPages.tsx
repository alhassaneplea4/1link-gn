import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Icon, LinkButton } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { AuthHeading } from './parts';

export function SignOutContent() {
  const t = useT('auth');
  useDocumentTitle(`${t('auth.signOut.title')} · 1Link`);
  const navigate = useNavigate();
  const signOut = useSession((s) => s.signOut);
  const dirty = useEditor((s) => s.dirty);
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-state">
      <span className="auth-state__icon"><Icon name="logout" size={28} /></span>
      <AuthHeading title={t('auth.signOut.title')} subtitle={t('auth.signOut.text')} />
      {dirty && <Alert tone="warning">{t('auth.signOut.unsaved')}</Alert>}
      <div className="auth-state__actions">
        <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); await signOut(); navigate(paths.signedOut, { replace: true }); }}>{t('auth.signOut.confirm')}</Button>
        <Button variant="secondary" onClick={() => navigate(-1)}>{t('auth.signOut.cancel')}</Button>
      </div>
    </div>
  );
}

export function SignedOutContent() {
  const t = useT('auth');
  useDocumentTitle(`${t('auth.signedOut.title')} · 1Link`);
  return (
    <div className="auth-state">
      <span className="auth-state__icon auth-state__icon--ok"><Icon name="check-circle" size={28} /></span>
      <AuthHeading title={t('auth.signedOut.title')} subtitle={t('auth.signedOut.text')} />
      <div className="auth-state__actions">
        <LinkButton to={paths.login} variant="gradient">{t('auth.signedOut.login')}</LinkButton>
        <LinkButton to={paths.home} variant="secondary">{t('auth.signedOut.home')}</LinkButton>
      </div>
    </div>
  );
}

export function SessionExpiredContent() {
  const t = useT('auth');
  useDocumentTitle(`${t('auth.expired.title')} · 1Link`);
  const [params] = useSearchParams();
  const next = params.get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <div className="auth-state">
      <span className="auth-state__icon auth-state__icon--bad"><Icon name="clock" size={28} /></span>
      <AuthHeading title={t('auth.expired.title')} subtitle={t('auth.expired.text')} />
      <LinkButton to={`${paths.login}${safe}`} variant="gradient">{t('auth.expired.login')}</LinkButton>
    </div>
  );
}
