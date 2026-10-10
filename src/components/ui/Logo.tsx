import { useId } from 'react';
import './logo.css';

/**
 * Identité visuelle 1Link — « 1 » et « L » fusionnés, terminés par un maillon.
 * NOTE : aucun fichier de logo officiel n'a été fourni avec le projet. Ce symbole est une
 * implémentation provisoire fidèle au concept de marque. Pour utiliser le logo officiel,
 * remplacez uniquement le contenu de <LogoSymbol /> (et public/*.svg) : tout le produit suit.
 */
export function LogoSymbol({ size = 36, title, className }: { size?: number; title?: string; className?: string }) {
  const gid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gid})`} />
      <path d="M14.5 17.5 22 11.5V34h8" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="34" r="3.1" fill="none" stroke="#fff" strokeWidth="2.6" />
    </svg>
  );
}

export type LogoVariant = 'horizontal' | 'compact' | 'symbol';

interface LogoProps {
  variant?: LogoVariant;
  /** `dark` : texte foncé pour fonds clairs · `light` : texte clair pour fonds sombres · `auto` : suit le thème. */
  tone?: 'auto' | 'dark' | 'light';
  size?: number;
  className?: string;
}

export function Logo({ variant = 'horizontal', tone = 'auto', size = 34, className = '' }: LogoProps) {
  if (variant === 'symbol') return <LogoSymbol size={size} title="1Link" className={className} />;
  return (
    <span className={`logo logo--${tone} logo--${variant} ${className}`} aria-label="1Link" role="img">
      <LogoSymbol size={size} />
      <span className="logo__word" aria-hidden="true">
        {variant === 'compact' ? (
          <>1<span>L</span></>
        ) : (
          <>1<span>Link</span></>
        )}
      </span>
    </span>
  );
}
