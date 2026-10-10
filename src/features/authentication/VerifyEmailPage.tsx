import { isContactVerified } from '@/models/auth';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Icon, LinkButton, Spinner, useToast } from '@/components/ui';
import { api } from '@/services/api';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import { AuthHeading } from './parts';

const COOLDOWN = 30;

/** États : lien reçu (jeton) → vérification ; sinon écran d'attente avec renvoi temporisé. */
export default function VerifyEmailPage() {
  const t = useT('auth', 'common');
  useDocumentTitle(`${t('auth.verify.title')} · 1Link`);
  const toast = useToast();
  const [params] = useSearchParams();
  const token = params.get('token');
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.session?.user);
  const setSession = useSession((s) => s.setSession);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'done' | 'error'>(token ? 'checking' : 'idle');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || status === 'loading') return;
    let live = true;
    api.auth.verifyEmail(token).then(
      (s) => { if (live) { if (s) setSession(s); setPhase('done'); } },
      () => live && setPhase('error'),
    );
    return () => { live = false; };
  }, [token, status, setSession]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const resend = async () => {
    setBusy(true);
    try {
      await api.auth.resendVerification();
      toast.push({ tone: 'success', title: t('auth.verify.resent') });
      setCooldown(COOLDOWN);
    } catch {
      toast.push({ tone: 'error', title: t('auth.errors.generic') });
    } finally {
      setBusy(false);
    }
  };
  if (status === 'loading' || phase === 'checking') {
    return <div className="auth-state"><Spinner size={28} label={t('auth.verify.checking')} /><p>{t('auth.verify.checking')}</p></div>;
  }
  if (phase === 'done' || (user && isContactVerified(user) && !token)) {
    return (
      <div className="auth-state">
        <span className="auth-state__icon auth-state__icon--ok"><Icon name="check-circle" size={28} /></span>
        <AuthHeading title={t('auth.verify.doneTitle')} subtitle={t('auth.verify.doneText')} />
        <LinkButton to={user?.onboardingDone ? paths.dashboard.root : paths.onboarding} variant="gradient" iconRight="arrow-right">{t('auth.verify.continue')}</LinkButton>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className="auth-state">
        <span className="auth-state__icon auth-state__icon--bad"><Icon name="x-circle" size={28} /></span>
        <AuthHeading title={t('auth.verify.errorTitle')} subtitle={t('auth.verify.errorText')} />
        <LinkButton to={paths.verifyEmail} variant="secondary" onClick={() => setPhase('idle')}>{t('auth.verify.resend')}</LinkButton>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="auth-state">
        <AuthHeading title={t('auth.verify.title')} subtitle={t('auth.verify.signIn')} />
        <LinkButton to={`${paths.login}?next=${encodeURIComponent(paths.verifyEmail)}`} variant="gradient">{t('auth.login.submit')}</LinkButton>
      </div>
    );
  }
  return (
    <div className="auth-state">
      <span className="auth-state__icon"><Icon name="mail" size={28} /></span>
      <AuthHeading title={t('auth.verify.title')} subtitle={t('auth.verify.subtitle', { email: user.email ?? '' })} />
      <p className="muted">{t('auth.verify.why')}</p>
      <Button variant="secondary" onClick={() => void resend()} disabled={cooldown > 0} loading={busy}>{cooldown > 0 ? t('auth.verify.resendIn', { s: cooldown }) : t('auth.verify.resend')}</Button>
      <LinkButton to={user.onboardingDone ? paths.dashboard.root : paths.onboarding} variant="link">{t('common.back')}</LinkButton>
    </div>
  );
}
