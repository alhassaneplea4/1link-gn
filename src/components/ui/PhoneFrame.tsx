import { forwardRef, type ReactNode } from 'react';
import { cx } from '@/utilities/misc';

/** Cadre de téléphone décoratif autour d'une page 1Link (aperçu éditeur, apparence, landing). */
export const PhoneFrame = forwardRef<HTMLDivElement, { children: ReactNode; label: string; className?: string; tilt?: boolean; /** Aperçu purement décoratif : pas de défilement, pas d'arrêt de tabulation. */ decorative?: boolean }>(function PhoneFrame({ children, label, className, tilt, decorative }, ref) {
  return (
    <figure className={cx('phone', tilt && 'phone--tilt', className)} aria-label={label}>
      <div className="phone__bezel">
        <span className="phone__notch" aria-hidden="true" />
        <div className={cx('phone__screen', decorative && 'is-static')} ref={ref} {...(decorative ? {} : { tabIndex: 0, role: 'region', 'aria-label': label })}>{children}</div>
      </div>
    </figure>
  );
});
