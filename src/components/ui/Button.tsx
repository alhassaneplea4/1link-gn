import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '@/utilities/misc';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'gradient' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Shared {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
  children?: ReactNode;
}

export const buttonClass = ({ variant = 'primary', size = 'md', fullWidth, loading }: Shared & { loading?: boolean }, extra?: string) =>
  cx('btn', `btn--${variant}`, `btn--${size}`, fullWidth && 'btn--block', loading && 'is-loading', extra);

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  );
}

export interface ButtonProps extends Shared, ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

/** Bouton. `loading` désactive les doubles soumissions tout en gardant la largeur stable. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, iconLeft, iconRight, fullWidth, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass({ variant, size, fullWidth, loading }, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : iconLeft && <Icon name={iconLeft} size={size === 'sm' ? 16 : 18} />}
      {children != null && <span className="btn__label">{children}</span>}
      {!loading && iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
});

export interface LinkButtonProps extends Shared, Omit<LinkProps, 'children'> {}

/** Lien de navigation interne stylé comme un bouton. */
export function LinkButton({ variant, size, iconLeft, iconRight, fullWidth, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass({ variant, size, fullWidth }, className)} {...rest}>
      {iconLeft && <Icon name={iconLeft} size={size === 'sm' ? 16 : 18} />}
      <span className="btn__label">{children}</span>
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </Link>
  );
}

export function AnchorButton({ variant, size, iconLeft, iconRight, fullWidth, className, children, ...rest }: Shared & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass({ variant, size, fullWidth }, className)} {...rest}>
      {iconLeft && <Icon name={iconLeft} size={size === 'sm' ? 16 : 18} />}
      <span className="btn__label">{children}</span>
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </a>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Obligatoire : nom accessible du bouton. */
  label: string;
  variant?: 'ghost' | 'secondary' | 'danger' | 'primary';
  size?: ButtonSize;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={cx('iconbtn', `iconbtn--${variant}`, `iconbtn--${size}`, active && 'is-active', className)} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  );
});
