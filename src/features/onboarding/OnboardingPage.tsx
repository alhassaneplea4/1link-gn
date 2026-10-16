import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, Icon, Logo, Spinner } from '@/components/ui';
import { api } from '@/services/api';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { paths } from '@/app/configuration/paths';
import { pageShareUrl } from '@/app/configuration/env';
import { useDocumentTitle } from '@/hooks/dom';
import { useT, useLocale } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { composeDocument, usernameCandidates } from './compose';
import { CategoryStep, ProfileStep } from './steps';
import { STEPS, restoreOnboarding, snapshotOnboarding, useOnboarding, type OnboardingData } from './store';
import { validateStep } from './validate';
import './onboarding.css';

/** Première adresse disponible parmi les candidates dérivées du nom (le serveur reste l'autorité à la publication). */
async function pickUsername(displayName: string): Promise<string> {
  const candidates = usernameCandidates(displayName);
  for (const c of candidates) {
    const r = await api.page.checkUsername(c).catch(() => null);
    if (r?.available) return c;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * Configuration du compte en deux étapes : le type de compte, puis le profil (photo, couverture, nom complet, secteur, titre).
 * « Valider mon compte » crée et publie la page puis ouvre la vue d'ensemble ; les blocs s'ajoutent ensuite depuis « Ma page ».
 */
export default function OnboardingPage() {
  const t = useT('onboarding', 'common', 'editor');
  useDocumentTitle(`${t('onboarding.title')} · 1Link`);
  const navigate = useNavigate();
  const { locales, locale, setLocale } = useLocale();
  const user = useSession((s) => s.session?.user);
  const data = useOnboarding();
  const { step, go } = data;
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [restored, setRestored] = useState(false);

  // Reprise : le brouillon de l'assistant est conservé sur le serveur (même compte, n'importe quel appareil).
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Record<string, unknown> | null = null;
    const flush = () => {
      if (!pending) return;
      const state = pending;
      pending = null;
      void api.page.saveOnboardingState(state).catch(() => undefined);
    };
    let unsubscribe: (() => void) | undefined;
    api.page.getOnboardingState().then((raw) => { if (live && raw) restoreOnboarding(raw); }, () => undefined).finally(() => {
      if (!live) return;
      setRestored(true);
      unsubscribe = useOnboarding.subscribe((s) => {
        pending = snapshotOnboarding(s);
        clearTimeout(timer);
        timer = setTimeout(flush, 800);
      });
    });
    return () => { live = false; unsubscribe?.(); clearTimeout(timer); flush(); };
  }, []);

  const stepId = STEPS[step] ?? 'category';
  const doc = useMemo(() => composeDocument(data as OnboardingData, user?.name ?? '', 'exemple'), [data.category, data.identity, data.activity, user?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const errors = useMemo(() => validateStep(stepId, data as OnboardingData), [stepId, data.category, data.identity, data.activity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus sur le titre de l'étape à chaque changement (lecteurs d'écran + clavier).
  useEffect(() => { heading.current?.focus({ preventScroll: false }); window.scrollTo({ top: 0 }); }, [step]);

  if (user?.onboardingDone) return <Navigate to={paths.dashboard.root} replace />;
  if (!restored) return <div className="fullpage-loader" role="status"><Spinner size={28} label={t('common.loading')} /></div>;

  const last = step === STEPS.length - 1;

  const validate = async () => {
    setBusy(true);
    setPublishError(null);
    const username = await pickUsername(data.identity.displayName || user?.name || '');
    const composed = composeDocument(data as OnboardingData, user?.name ?? '', username);
    // Un brouillon peut déjà exister côté serveur (assistant interrompu) : on repart de sa version pour ne rien écraser par erreur.
    const existing = await api.page.getMyPage().catch(() => null);
    useEditor.setState({ status: 'ready', doc: existing ? { ...composed, id: existing.id, version: existing.version, username: existing.username || username } : composed, saved: null, past: [], future: [], dirty: true });
    const result = await useEditor.getState().publish();
    setBusy(false);
    if (!result.ok) { setPublishError(result.error ?? 'unknown'); return; }
    useOnboarding.getState().reset();
    void api.page.saveOnboardingState(null).catch(() => undefined);
    navigate(paths.dashboard.root, { replace: true });
  };

  const next = () => {
    if (Object.keys(errors).length) { setShowErrors(true); return; }
    setShowErrors(false);
    if (last) void validate();
    else go(Math.min(STEPS.length - 1, step + 1));
  };
  const back = () => { setShowErrors(false); go(Math.max(0, step - 1)); };
  const jump = (i: number) => {
    // On ne saute en avant que vers des étapes déjà atteintes ; on peut toujours revenir en arrière.
    if (i <= Math.max(step, data.visited)) { setShowErrors(false); go(i); }
  };

  const body = stepId === 'category' ? <CategoryStep errors={errors} showErrors={showErrors} /> : <ProfileStep errors={errors} showErrors={showErrors} />;

  return (
    <div className="onb">
      <a href="#onb-main" className="skip-link">{t('common.skipToContent')}</a>
      <header className="onb__top">
        <Link to={paths.home} aria-label="1Link"><Logo /></Link>
        <div className="onb__top-right">
          <select className="onb__lang" value={locale} onChange={(e) => void setLocale(e.target.value as typeof locale)} aria-label={t('common.language')}>{locales.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
        </div>
      </header>

      <div className="onb__layout">
        <nav className="onb__steps" aria-label={t('onboarding.stepsLabel')}>
          <p className="onb__progress-text" aria-live="polite">{t('onboarding.stepOf', { n: step + 1, total: STEPS.length })}</p>
          <div className="onb__bar" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={t('onboarding.stepsLabel')}><span style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }} /></div>
          <ol role="list" className="onb__list">
            {STEPS.map((s, i) => {
              const done = i < step;
              const reachable = i <= Math.max(step, data.visited);
              return (
                <li key={s}>
                  <button type="button" className={`onb__step ${i === step ? 'is-current' : ''} ${done ? 'is-done' : ''}`} aria-current={i === step ? 'step' : undefined} disabled={!reachable} onClick={() => jump(i)}>
                    <span className="onb__dot" aria-hidden="true">{done ? <Icon name="check" size={13} strokeWidth={3.4} /> : i + 1}</span>
                    <span>{t(`onboarding.steps.${s}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main id="onb-main" className="onb__main">
          <div className="onb__card" key={stepId}>
            <h1 ref={heading} tabIndex={-1} className="onb__title">{t(`onboarding.${stepId}.title`)}</h1>
            <p className="onb__lead">{t(`onboarding.${stepId}.lead`)}</p>
            {body}
            {publishError && <p className="field__error" role="alert"><Icon name="alert-circle" size={14} /> {t(`editor.publish.errors.${['username_taken', 'username_invalid', 'username_reserved', 'plan_limit'].includes(publishError) ? publishError : 'unknown'}` as 'editor.publish.errors.unknown')}</p>}
          </div>
          <div className="onb__nav">
            <Button variant="ghost" iconLeft="arrow-left" onClick={back} disabled={step === 0 || busy}>{t('common.back')}</Button>
            <div className="onb__nav-right">
              <Button variant="gradient" iconRight={last ? 'check' : 'arrow-right'} loading={busy} onClick={next}>{last ? t('onboarding.validate') : t('common.continue')}</Button>
            </div>
          </div>
        </main>

        <aside className="onb__preview" aria-label={t('onboarding.livePreview')}>
          <div className="onb__sticky">
            <PhoneFrame label={t('onboarding.livePreview')}>
              <PageRenderer page={doc} pageUrl={pageShareUrl('exemple')} preview layout="profile" />
            </PhoneFrame>
            <p className="subtle onb__caption">{t('onboarding.livePreview')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
