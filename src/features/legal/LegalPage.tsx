import { Link } from 'react-router-dom';
import { LinkButton } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/dom';
import { useLocale, useT } from '@/i18n/core';
import { paths } from '@/app/configuration/paths';
import { LEGAL, type LegalKind } from './content';
import './legal.css';

/** Page juridique (confidentialité, conditions, suppression du compte) rendue depuis `content.ts`, dans la langue choisie. */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { locale } = useLocale();
  const t = useT('marketing');
  const doc = LEGAL[locale === 'en' ? 'en' : 'fr'][kind];
  useDocumentTitle(`${doc.title} · 1Link`);
  return (
    <article className="legal container">
      <header className="legal__head">
        <h1>{doc.title}</h1>
        <p className="legal__updated">{doc.updated}</p>
        <p className="legal__intro">{doc.intro}</p>
        <nav className="legal__tabs" aria-label={t('marketing.footer.legal')}>
          <Link to={paths.privacy} aria-current={kind === 'privacy' ? 'page' : undefined}>{LEGAL[locale === 'en' ? 'en' : 'fr'].privacy.title}</Link>
          <Link to={paths.terms} aria-current={kind === 'terms' ? 'page' : undefined}>{LEGAL[locale === 'en' ? 'en' : 'fr'].terms.title}</Link>
          <Link to={paths.deleteAccount} aria-current={kind === 'deleteAccount' ? 'page' : undefined}>{LEGAL[locale === 'en' ? 'en' : 'fr'].deleteAccount.title}</Link>
        </nav>
      </header>
      {doc.sections.map((s) => (
        <section key={s.title} className="legal__section">
          <h2>{s.title}</h2>
          {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
          {s.items && <ul>{s.items.map((i) => <li key={i}>{i}</li>)}</ul>}
        </section>
      ))}
      {kind === 'deleteAccount' && (
        <p className="legal__cta"><LinkButton to={paths.dashboard.settings} variant="gradient">{t('marketing.footer.goToSettings')}</LinkButton></p>
      )}
    </article>
  );
}

export const PrivacyPage = () => <LegalPage kind="privacy" />;
export const TermsPage = () => <LegalPage kind="terms" />;
export const DeleteAccountInfoPage = () => <LegalPage kind="deleteAccount" />;
