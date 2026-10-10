import { useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n/core';
import { useDialogBehavior } from '@/hooks/dom';
import { cx } from '@/utilities/misc';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { IconButton } from './Button';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Fermer en cliquant sur le fond. */
  dismissible?: boolean;
  className?: string;
  /** Rôle ARIA : `alertdialog` pour les confirmations destructrices. */
  role?: 'dialog' | 'alertdialog';
}

function Frame({ kind, open, onClose, title, description, children, footer, dismissible = true, className, role = 'dialog', side = 'right', size = 'md' }: OverlayProps & { kind: 'modal' | 'drawer'; side?: 'right' | 'left' | 'bottom'; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT('common');
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialogBehavior(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <div className={cx('overlay', `overlay--${kind}`)} data-side={kind === 'drawer' ? side : undefined}>
      <div className="overlay__backdrop" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx('dialog', `dialog--${kind}`, `dialog--${size}`, className)}
      >
        <header className="dialog__head">
          <div>
            <h2 id={titleId} className="dialog__title">{title}</h2>
            {description && <p id={descId} className="dialog__desc">{description}</p>}
          </div>
          <IconButton icon="x" label={t('common.close')} onClick={onClose} size="sm" />
        </header>
        <div className="dialog__body">{children}</div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Modal(props: OverlayProps & { size?: 'sm' | 'md' | 'lg' }) {
  return <Frame kind="modal" {...props} />;
}

export function Drawer(props: OverlayProps & { side?: 'right' | 'left' | 'bottom'; size?: 'sm' | 'md' | 'lg' }) {
  return <Frame kind="drawer" {...props} />;
}

export interface ConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** Si fourni, l'utilisateur doit saisir ce texte pour activer la confirmation (actions très sensibles). */
  requireText?: string;
  children?: ReactNode;
}

export function ConfirmDialog({ open, onCancel, onConfirm, title, description, confirmLabel, cancelLabel, tone = 'primary', loading, requireText, children }: ConfirmDialogProps) {
  const t = useT('common');
  const [typed, setTyped] = useState('');
  const blocked = Boolean(requireText) && typed.trim() !== requireText;
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      description={description}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel ?? t('common.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={() => void onConfirm()} loading={loading} disabled={blocked} data-autofocus={!requireText ? '' : undefined}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireText && (
        <label className="field" style={{ marginTop: 'var(--space-3)' }}>
          <span className="field__label">{t('common.typeToConfirm', { text: requireText })}</span>
          <span className="control"><input className="control__input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus="" /></span>
        </label>
      )}
    </Modal>
  );
}

export function DialogIcon({ name, tone = 'brand' }: { name: IconName; tone?: 'brand' | 'danger' | 'success' | 'warning' }) {
  return <span className={cx('dialog-icon', `dialog-icon--${tone}`)}><Icon name={name} size={22} /></span>;
}
