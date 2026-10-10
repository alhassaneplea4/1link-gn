import { forwardRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconButton, Input, type InputProps } from '@/components/ui';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import type { MessageKey } from '@/i18n/types';
import type { Session } from '@/models/auth';
import { paths } from '@/app/configuration/paths';
import { Segmented } from '@/components/ui';

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'suffix'>>(function PasswordInput(props, ref) {
  const t = useT('auth');
  const [shown, setShown] = useState(false);
  return (
    <Input
      ref={ref} {...props} type={shown ? 'text' : 'password'} autoCapitalize="none" spellCheck={false}
      suffix={<IconButton size="sm" icon={shown ? 'eye-off' : 'eye'} label={shown ? t('auth.fields.hidePassword') : t('auth.fields.showPassword')} onClick={() => setShown((s) => !s)} aria-pressed={shown} />}
    />
  );
});

export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="auth-heading">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

/** Chemin de retour demandé (`?next=`), limité aux chemins internes (anti « open redirect »). */
export function useNextPath(): string | null {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

/** Traduit une erreur d'API en clé de message d'authentification. */
export function authErrorKey(e: unknown): MessageKey {
  if (isApiError(e)) {
    if (e.code === 'network') return 'auth.errors.network';
    if (e.code === 'unauthorized') return 'auth.errors.invalidCredentials';
    if (e.code === 'forbidden') return 'auth.errors.suspended';
    if (e.code === 'conflict') return 'auth.errors.emailTaken';
    if (e.message === 'invalid_token' || e.message === 'token_expired') return 'auth.errors.invalidToken';
    if (e.message === 'weak_password') return 'auth.errors.weakPassword';
  }
  return 'auth.errors.generic';
}

export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return pw ? 1 : 0;
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)) score++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score = Math.max(score, 2);
  return Math.min(3, score) as 1 | 2 | 3;
}

/** Où envoyer l'utilisateur une fois authentifié : retour demandé, onboarding, admin ou dashboard. */
export const afterAuthPath = (session: Session, next: string | null): string =>
  next ?? (!session.user.onboardingDone ? paths.onboarding : session.user.adminRole ? paths.admin.root : paths.dashboard.root);

export type AuthMethod = 'email' | 'phone';

/** Bascule « E-mail / Téléphone » des écrans de connexion et d'inscription. */
export function MethodSwitch({ value, onChange }: { value: AuthMethod; onChange: (m: AuthMethod) => void }) {
  const t = useT('auth');
  return <Segmented label={t('auth.method.label')} value={value} onChange={onChange} className="auth-method" options={[{ value: 'email', label: t('auth.method.email'), icon: 'mail' }, { value: 'phone', label: t('auth.method.phone'), icon: 'phone' }]} />;
}
