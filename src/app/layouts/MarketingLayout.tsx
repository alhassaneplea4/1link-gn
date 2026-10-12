import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, LinkButton, Logo } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { CATEGORY_IDS } from '@/models/category';
import { useLocale, useT } from '@/i18n/core';
import { useSession } from '@/state/session';
import './marketing-layout.css';

function Header() {
  const t = useT('marketing', 'common');
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const user = useSession((s) => s.session?.user);
  useEffect(() => setOpen(false), [location.pathname, location.hash]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links = [
    { to: '/#features', label: t('marketing.nav.features') },
    { to: '/#audiences', label: t('marketing.nav.audiences') },
    { to: '/#pricing', label: t('marketing.nav.pricing') },
    { to: '/#faq', label: t('marketing.nav.faq') },
  ];
  const home = user ? (user.onboardingDone ? (user.adminRole ? paths.admin.root : paths.dashboard.root) : paths.onboarding) : null;

  return (
    <header className={`mhead ${scrolled || open ? 'is-scrolled' : ''}`}>
      <div className="container container--xl mhead__bar">
        <Link to={paths.home} className="mhead__logo" aria-label="1Link"><Logo /></Link>
        <nav className="mhead__nav" aria-label={t('marketing.nav.label')}>
          {links.map((l) => <Link key={l.to} to={l.to} className="mhead__link">{l.label}</Link>)}
        </nav>
        <div className="mhead__actions">
          {home ? (
            <LinkButton to={home} variant="gradient" size="sm" iconRight="arrow-right">{t('marketing.nav.myspace')}</LinkButton>
          ) : (
            <>
              <LinkButton to={paths.login} variant="ghost" size="sm" className="mhead__login">{t('marketing.nav.login')}</LinkButton>
              <LinkButton to={paths.register} variant="gradient" size="sm" className="mhead__cta">{t('marketing.nav.cta')}</LinkButton>
            </>
          )}
          <button type="button" className="mhead__burger" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t('marketing.nav.closeMenu') : t('marketing.nav.openMenu')} onClick={() => setOpen((o) => !o)}>
            <span className={`burger ${open ? 'is-open' : ''}`} aria-hidden="true"><i /><i /><i /></span>
          </button>
        </div>
      </div>
      <div id="mobile-menu" className={`mmenu ${open ? 'is-open' : ''}`} inert={!open}>
        <nav aria-label={t('marketing.nav.label')} className="container mmenu__nav">
          {links.map((l, i) => <Link key={l.to} to={l.to} className="mmenu__link" style={{ transitionDelay: `${i * 40}ms` }}>{l.label}<Icon name="chevron-right" size={18} /></Link>)}
          <div className="mmenu__cta">
            {home ? <LinkButton to={home} variant="gradient" size="lg" fullWidth>{t('marketing.nav.myspace')}</LinkButton> : (
              <>
                <LinkButton to={paths.register} variant="gradient" size="lg" fullWidth>{t('marketing.nav.cta')}</LinkButton>
                <LinkButton to={paths.login} variant="secondary" size="lg" fullWidth>{t('marketing.nav.login')}</LinkButton>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const t = useT('marketing', 'common');
  const { locale, setLocale, locales } = useLocale();
  return (
    <footer className="mfoot">
      <div className="container container--xl mfoot__grid">
        <div className="mfoot__brand">
          <Logo tone="light" />
          <p>{t('marketing.footer.description')}</p>
          <label className="mfoot__lang">
            <span className="sr-only">{t('marketing.footer.language')}</span>
            <Icon name="languages" size={16} />
            <select value={locale} onChange={(e) => void setLocale(e.target.value as typeof locale)} aria-label={t('marketing.footer.language')}>
              {locales.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
        </div>
        <nav aria-label={t('marketing.footer.product')}>
          <h2>{t('marketing.footer.product')}</h2>
          <ul role="list">
            <li><NavLink to={paths.features}>{t('marketing.nav.features')}</NavLink></li>
            <li><NavLink to={paths.pricing}>{t('marketing.nav.pricing')}</NavLink></li>
            <li><NavLink to={paths.faq}>{t('marketing.nav.faq')}</NavLink></li>
          </ul>
        </nav>
        <nav aria-label={t('marketing.footer.forWho')}>
          <h2>{t('marketing.footer.forWho')}</h2>
          <ul role="list">
            {CATEGORY_IDS.map((c) => <li key={c}><Link to="/#audiences">{t(`common.categories.${c}.label`)}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label={t('marketing.footer.legal')}>
          <h2>{t('marketing.footer.legal')}</h2>
          <ul role="list">
            <li><NavLink to={paths.privacy}>{t('marketing.footer.privacy')}</NavLink></li>
            <li><NavLink to={paths.terms}>{t('marketing.footer.terms')}</NavLink></li>
            <li><NavLink to={paths.deleteAccount}>{t('marketing.footer.deleteAccount')}</NavLink></li>
          </ul>
        </nav>
        <nav aria-label={t('marketing.footer.account')}>
          <h2>{t('marketing.footer.account')}</h2>
          <ul role="list">
            <li><Link to={paths.login}>{t('marketing.nav.login')}</Link></li>
            <li><Link to={paths.register}>{t('marketing.nav.cta')}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="container container--xl mfoot__bottom">
        <small>{t('marketing.footer.rights', { year: new Date().getFullYear() })}</small>
        <small>{t('marketing.footer.madeIn')}</small>
      </div>
    </footer>
  );
}

export default function MarketingLayout() {
  const t = useT('common');
  return (
    <div className="marketing">
      <a href="#main" className="skip-link">{t('common.skipToContent')}</a>
      <Header />
      <main id="main"><Outlet /></main>
      <Footer />
    </div>
  );
}
