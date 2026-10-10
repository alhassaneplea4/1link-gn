import { createContext, forwardRef, useContext, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/utilities/misc';
import { Icon } from './Icon';

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optionalLabel?: string;
  id: string;
  className?: string;
  children: ReactNode;
}

/** Enveloppe de champ : libellé, aide et message d'erreur reliés par aria-describedby. */
function FieldShell({ label, hint, error, required, optionalLabel, id, className, children }: FieldShellProps) {
  return (
    <div className={cx('field', error ? 'has-error' : undefined, className)}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
          {required && <span className="field__req" aria-hidden="true"> *</span>}
          {!required && optionalLabel && <span className="field__opt"> {optionalLabel}</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="field__hint" id={`${id}-hint`}>{hint}</p>}
      {error && (
        <p className="field__error" id={`${id}-err`} role="alert">
          <Icon name="alert-circle" size={14} /> {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: ReactNode) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

interface CommonProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optionalLabel?: string;
  wrapperClassName?: string;
}

export interface InputProps extends CommonProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  /** Contenu décoratif avant la saisie (icône, préfixe de domaine…). */
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optionalLabel, wrapperClassName, prefix, suffix, className, id: idProp, required, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} optionalLabel={optionalLabel} className={wrapperClassName}>
      <div className={cx('control', error ? 'is-invalid' : false)}>
        {prefix && <span className="control__affix">{prefix}</span>}
        <input ref={ref} id={id} className={cx('control__input', className)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} required={required} {...rest} />
        {suffix && <span className="control__affix control__affix--end">{suffix}</span>}
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends CommonProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optionalLabel, wrapperClassName, className, id: idProp, required, showCount, value, maxLength, rows = 4, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  const len = typeof value === 'string' ? value.length : 0;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} optionalLabel={optionalLabel} className={wrapperClassName}>
      <div className={cx('control control--area', error ? 'is-invalid' : false)}>
        <textarea ref={ref} id={id} rows={rows} value={value} maxLength={maxLength} className={cx('control__input', className)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} required={required} {...rest} />
      </div>
      {showCount && maxLength && <p className="field__count" aria-hidden="true">{len}/{maxLength}</p>}
    </FieldShell>
  );
});

export interface SelectProps extends CommonProps, SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optionalLabel, wrapperClassName, className, id: idProp, required, children, ...rest },
  ref,
) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} optionalLabel={optionalLabel} className={wrapperClassName}>
      <div className={cx('control control--select', error ? 'is-invalid' : false)}>
        <select ref={ref} id={id} className={cx('control__input', className)} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} required={required} {...rest}>
          {children}
        </select>
        <Icon name="chevron-down" size={18} className="control__chevron" />
      </div>
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, hint, error, className, id: idProp, ...rest }, ref) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={cx('check', error ? 'has-error' : false, className)}>
      <label className="check__row" htmlFor={id}>
        <input ref={ref} id={id} type="checkbox" className="check__input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} />
        <span className="check__box" aria-hidden="true"><Icon name="check" size={14} strokeWidth={3.2} /></span>
        <span className="check__text">{label}</span>
      </label>
      {hint && !error && <p className="field__hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field__error" id={`${id}-err`} role="alert"><Icon name="alert-circle" size={14} /> {error}</p>}
    </div>
  );
});

/* — Radio : groupe contrôlé — */
interface RadioCtx { name: string; value: string; onChange: (v: string) => void }
const RadioContext = createContext<RadioCtx | null>(null);

export function RadioGroup({ legend, name, value, onChange, children, className, inline }: { legend: ReactNode; name: string; value: string; onChange: (v: string) => void; children: ReactNode; className?: string; inline?: boolean }) {
  return (
    <fieldset className={cx('radiogroup', inline && 'radiogroup--inline', className)}>
      <legend className="field__label">{legend}</legend>
      <RadioContext.Provider value={{ name, value, onChange }}>{children}</RadioContext.Provider>
    </fieldset>
  );
}

export function Radio({ value, label, hint, disabled }: { value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const ctx = useContext(RadioContext);
  const id = useId();
  if (!ctx) throw new Error('<Radio> doit être utilisé dans <RadioGroup>');
  return (
    <div className="check">
      <label className="check__row" htmlFor={id}>
        <input id={id} type="radio" className="check__input" name={ctx.name} value={value} checked={ctx.value === value} disabled={disabled} onChange={() => ctx.onChange(value)} />
        <span className="check__box check__box--radio" aria-hidden="true" />
        <span className="check__text">{label}</span>
      </label>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'onChange'> {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, hint, checked, onChange, className, id: idProp, ...rest }: ToggleProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={cx('toggle', className)}>
      <label className="toggle__row" htmlFor={id}>
        <span className="toggle__text">
          <span className="toggle__label">{label}</span>
          {hint && <span className="field__hint" id={`${id}-hint`}>{hint}</span>}
        </span>
        <input id={id} type="checkbox" role="switch" className="toggle__input" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
        <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
      </label>
    </div>
  );
}
