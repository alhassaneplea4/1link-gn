import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { TwoFactorChallenge } from '@/models/auth';
import { AuthHeading, MethodSwitch, type AuthMethod } from './parts';
import { EmailCodeAuth } from './EmailCodeAuth';
import { PhoneAuth } from './PhoneAuth';
import { TwoFactorStep } from './TwoFactorStep';

/** Inscription : une adresse e-mail suffit. Un code envoyé à cette adresse la confirme et crée le compte (aucun mot de passe). */
export default function RegisterPage() {
  const t = useT('auth', 'common');
  useDocumentTitle(`${t('auth.register.title')} · 1Link`);
  const navigate = useNavigate();
  const [method, setMethod] = useState<AuthMethod>('email');
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const done = () => navigate(paths.onboarding, { replace: true });

  // Adresse déjà connue avec vérification en deux étapes : la connexion se termine ici.
  if (challenge) {
    return (
      <>
        <AuthHeading title={t('auth.twoFactor.title')} subtitle={t('auth.twoFactor.subtitle')} />
        <TwoFactorStep challenge={challenge} onDone={() => navigate(paths.dashboard.root, { replace: true })} onBack={() => setChallenge(null)} />
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t('auth.register.title')} subtitle={t('auth.register.subtitle')} />
      <MethodSwitch value={method} onChange={setMethod} />
      {method === 'phone' ? <PhoneAuth mode="sign_up" onDone={done} /> : <EmailCodeAuth mode="sign_up" onDone={done} onTwoFactor={setChallenge} />}
      <p className="auth-alt">{t('auth.register.haveAccount')} <Link to={paths.login}>{t('auth.register.login')}</Link></p>
    </>
  );
}
