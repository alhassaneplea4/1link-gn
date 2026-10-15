import { useMemo } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Logo } from '@/components/ui';
import { PhoneFrame } from '@/components/ui/PhoneFrame';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { getSampleDocument } from '@/features/page-engine/samples';
import { paths } from '@/app/configuration/paths';
import { useT, useLocale } from '@/i18n/core';
import './auth-layout.css';

/** Mise en page des écrans d'authentification : formulaire à gauche, vitrine de la marque à droite (≥ 1024 px). */
export default function AuthLayout() {
  const t = useT('auth', 'pub', 'editor');
  const { locale, setLocale, locales } = useLocale();
  const doc = useMemo(() => getSampleDocument('creator'), []);
  return (
    <div className="authl">
      <a href="#main" className="skip-link">{t('common.skipToContent')}</a>
      <div className="authl__form">
        <header className="authl__top">
          <Link to={paths.home} aria-label="1Link"><Logo /></Link>
          <label className="authl__lang">
            <span className="sr-only">{t('common.language')}</span>
            <select value={locale} onChange={(e) => void setLocale(e.target.value as typeof locale)} aria-label={t('common.language')}>
              {locales.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
        </header>
        <main id="main" className="authl__main"><div className="authl__card"><Outlet /></div></main>
      </div>
      <aside className="authl__aside" aria-hidden="true">
        <div className="authl__glow" />
        <div className="authl__copy">
          <h2>{t('auth.brand.title')}</h2>
          <p>{t('auth.brand.text')}</p>
        </div>
        <PhoneFrame decorative label={t('auth.brand.example')} tilt className="authl__phone">
          <PageRenderer page={doc} pageUrl="https://1link.gn/mariama" preview layout="profile" />
        </PhoneFrame>
        <small className="authl__caption">{t('auth.brand.example')}</small>
      </aside>
    </div>
  );
}
