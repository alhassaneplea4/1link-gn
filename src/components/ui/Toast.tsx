import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n/core';
import { Icon, type IconName } from './Icon';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';
export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
  /** ms avant fermeture automatique ; 0 = persistant. */
  duration?: number;
  /** Lien d'action, affiché sous le message (ex. « Voir » après une publication) ; s'ouvre dans un nouvel onglet. */
  action?: { label: string; href: string; icon?: IconName };
}
interface ToastItem extends Required<Pick<ToastInput, 'tone' | 'title'>> { id: number; description?: string; action?: ToastInput['action'] }

const ICONS: Record<ToastTone, IconName> = { success: 'check-circle', error: 'x-circle', info: 'info', warning: 'alert' };
const Ctx = createContext<{ push: (t: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useT('common');
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (input: ToastInput) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { id, tone: input.tone ?? 'info', title: input.title, description: input.description, action: input.action }]);
      const duration = input.duration ?? (input.tone === 'error' ? 8000 : 4800);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(
        <div className="toasts" role="region" aria-label={t('common.notifications')}>
          <div aria-live="polite" aria-atomic="false">
            {items.map((x) => (
              <div key={x.id} className={`toast toast--${x.tone}`} role={x.tone === 'error' ? 'alert' : 'status'}>
                <Icon name={ICONS[x.tone]} size={20} />
                <div className="toast__body">
                  <strong>{x.title}</strong>
                  {x.description && <span>{x.description}</span>}
                  {x.action && (
                    <a className="toast__action" href={x.action.href} target="_blank" rel="noopener noreferrer">
                      <Icon name={x.action.icon ?? 'arrow-right'} size={14} strokeWidth={2.6} /> {x.action.label}
                    </a>
                  )}
                </div>
                <button type="button" className="toast__close" onClick={() => dismiss(x.id)} aria-label={t('common.close')}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast doit être utilisé dans <ToastProvider>');
  return ctx;
}
