import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, Input } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import { isEmail } from '@/utilities/validation';
import { AuthHeading, PasswordInput, authErrorKey, passwordStrength } from './parts';

export default function RegisterPage() {
  const t = useT('auth', 'common');
  useDocumentTitle(`${t('auth.register.title')} · 1Link`);
  const signUp = useSession((s) => s.signUp);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const strength = passwordStrength(form.password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('common.validation.required');
    if (!isEmail(form.email)) errs.email = t('common.validation.email');
    if (form.password.length < 8) errs.password = t('common.validation.passwordShort');
    if (!form.acceptTerms) errs.terms = t('auth.errors.termsRequired');
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await signUp(form);
      navigate(paths.onboarding, { replace: true });
    } catch (err) {
      const key = authErrorKey(err);
      if (key === 'auth.errors.emailTaken') setErrors({ email: t(key) });
      else setFormError(t(key));
      setBusy(false);
    }
  };

  return (
    <>
      <AuthHeading title={t('auth.register.title')} subtitle={t('auth.register.subtitle')} />
      <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Input label={t('auth.fields.name')} name="name" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} required />
        <Input label={t('auth.fields.email')} type="email" name="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} required />
        <div>
          <PasswordInput label={t('auth.fields.password')} name="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} hint={t('auth.register.passwordHint')} required />
          {form.password && (
            <div className="strength" aria-live="polite">
              <span className="strength__bar" data-level={strength} aria-hidden="true"><i /><i /><i /></span>
              <span>{t('auth.register.strength.label')} : {t(strength === 3 ? 'auth.register.strength.strong' : strength === 2 ? 'auth.register.strength.fair' : 'auth.register.strength.weak')}</span>
            </div>
          )}
        </div>
        <Checkbox label={t('auth.register.terms')} checked={form.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} error={errors.terms} />
        <Button type="submit" variant="gradient" size="lg" fullWidth loading={busy}>{t('auth.register.submit')}</Button>
      </form>
      <p className="auth-alt">{t('auth.register.haveAccount')} <Link to={paths.login}>{t('auth.register.login')}</Link></p>
    </>
  );
}
