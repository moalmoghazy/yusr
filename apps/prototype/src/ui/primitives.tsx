import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './icons';

export const cx = (...parts: Array<string | false | 0 | 0n | null | undefined>) => parts.filter(Boolean).join(' ');

// ------------------------------------------------------------------ Button

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft' | 'gold' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconEnd?: IconName;
  block?: boolean;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', icon, iconEnd, block, loading, className, children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children !== undefined && <span className="btn-label">{children}</span>}
      {iconEnd && !loading ? <Icon name={iconEnd} size={size === 'sm' ? 16 : 18} /> : null}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'ghost',
  className,
  ...rest
}: Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('icon-btn', `btn-${variant}`, `icon-btn-${size}`, className)} {...rest}>
      <Icon name={icon} size={size === 'sm' ? 16 : 19} />
    </button>
  );
}

// ------------------------------------------------------------------ Badges & chips

export type Tone = 'neutral' | 'primary' | 'gold' | 'urgent' | 'success' | 'warning' | 'info' | 'rose' | 'slate' | 'sky' | 'teal';

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cx('badge', `badge-${tone}`, className)} title={title}>
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      <span>{children}</span>
    </span>
  );
}

export function Chip({
  selected,
  onClick,
  icon,
  children,
  className,
  count,
}: {
  selected?: boolean;
  onClick?: () => void;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  count?: number;
}) {
  return (
    <button type="button" className={cx('chip', selected && 'is-selected', className)} aria-pressed={selected} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ Segmented control

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const backward = event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (!forward && !backward) return;
    event.preventDefault();
    const next = (index + (forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div className={cx('segmented', `segmented-${size}`, className)} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            tabIndex={active ? 0 : -1}
            className={cx('segment', active && 'is-active')}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {option.icon && <Icon name={option.icon} size={16} />}
            {option.label !== '' && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Tabs

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: ReadonlyArray<{ value: T; label: ReactNode; count?: number | string; icon?: IconName }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const onKey = (event: KeyboardEvent, index: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    let next = -1;
    if (event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = (index + 1) % tabs.length;
    if (event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div className={cx('tabs', className)} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            id={`${id}-${tab.value}`}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className={cx('tab', active && 'is-active')}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {tab.icon && <Icon name={tab.icon} size={16} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Form controls

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optionalLabel,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor: string;
  optionalLabel?: string;
}) {
  return (
    <div className={cx('field', error && 'has-error')}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optionalLabel && <span className="field-optional">{optionalLabel}</span>}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, icon, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: IconName }) {
  if (!icon) return <input className={cx('input', className)} {...rest} />;
  return (
    <span className={cx('input-wrap', className)}>
      <Icon name={icon} size={17} className="input-icon" />
      <input className="input input-with-icon" {...rest} />
    </span>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input', 'textarea', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx('select-wrap', className)}>
      <select className="input select" {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" size={16} className="select-caret" />
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  id?: string;
}) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <div className="switch-row">
      <button type="button" role="switch" id={switchId} aria-checked={checked} className={cx('switch', checked && 'is-on')} onClick={() => onChange(!checked)}>
        <span className="switch-thumb" />
      </button>
      <label htmlFor={switchId} className="switch-text">
        <span className="switch-label">{label}</span>
        {description && <span className="switch-description">{description}</span>}
      </label>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  id?: string;
}) {
  const autoId = useId();
  const boxId = id ?? autoId;
  return (
    <label className={cx('checkbox', checked && 'is-checked')} htmlFor={boxId}>
      <input id={boxId} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="checkbox-box" aria-hidden>
        <Icon name="check" size={14} strokeWidth={2.6} />
      </span>
      <span className="checkbox-text">
        <span>{label}</span>
        {description && <span className="checkbox-description">{description}</span>}
      </span>
    </label>
  );
}

// ------------------------------------------------------------------ Dialog / sheet / drawer

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'center',
  size = 'md',
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'center' | 'side' | 'sheet';
  size?: 'sm' | 'md' | 'lg';
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previous = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
        if (items.length === 0) return;
        const firstItem = items[0]!;
        const lastItem = items[items.length - 1]!;
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={cx('dialog-root', `dialog-${variant}`)}>
      <div className="dialog-overlay" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        className={cx('dialog-panel', `dialog-${size}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
        tabIndex={-1}
      >
        {(title || description) && (
          <header className="dialog-header">
            <div>
              {title && (
                <h2 className="dialog-title" id={titleId}>
                  {title}
                </h2>
              )}
              {description && <p className="dialog-description">{description}</p>}
            </div>
            <IconButton icon="x" label="×" onClick={onClose} className="dialog-close" />
          </header>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Toasts

export interface ToastInput {
  title: ReactNode;
  body?: ReactNode;
  tone?: 'default' | 'success' | 'gold' | 'error';
  icon?: IconName;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const push = useCallback(
    (toast: ToastInput) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((items) => [...items.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.duration ?? 4_800);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx('toast', `toast-${toast.tone ?? 'default'}`)}>
            {toast.icon && (
              <span className="toast-icon">
                <Icon name={toast.icon} size={18} />
              </span>
            )}
            <div className="toast-text">
              <strong>{toast.title}</strong>
              {toast.body && <span>{toast.body}</span>}
            </div>
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="×" onClick={() => dismiss(toast.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ------------------------------------------------------------------ Misc

export function Avatar({ name, size = 32, tone }: { name: string; size?: number; tone?: number }) {
  const initials = useMemo(() => {
    const parts = name.replace(/[.«»]/g, '').trim().split(/\s+/);
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  }, [name]);
  const hue = tone ?? [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;
  return (
    <span className={cx('avatar', `avatar-${hue}`)} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials}
    </span>
  );
}

export function EmptyState({ icon = 'search', title, body, action }: { icon?: IconName; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

/** Copies text; where the Clipboard API is blocked, selects `fallbackNode` so the user can copy it. */
export function useCopy(): [boolean, (value: string, fallbackNode?: HTMLElement | null) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback((value: string, fallbackNode?: HTMLElement | null) => {
    const done = () => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1_800);
    };
    const fallback = () => {
      if (!fallbackNode) return;
      const range = document.createRange();
      range.selectNodeContents(fallbackNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      done();
    };
    try {
      navigator.clipboard.writeText(value).then(done, fallback);
    } catch {
      fallback();
    }
  }, []);
  return [copied, copy];
}

export function CopyButton({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, copy] = useCopy();
  const target = useRef<HTMLSpanElement>(null);
  return (
    <span className="copy-field">
      <span ref={target} className="copy-value" dir="ltr">
        {value}
      </span>
      <button type="button" className="copy-btn" onClick={() => copy(value, target.current)} aria-label={copied ? copiedLabel : label}>
        <Icon name={copied ? 'check' : 'copy'} size={16} />
        <span>{copied ? copiedLabel : label}</span>
      </button>
    </span>
  );
}

/** Button-only variant for code blocks; `target` is selected when copying is blocked. */
export function CopyCodeButton({
  value,
  label,
  copiedLabel,
  target,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  target?: { current: HTMLElement | null };
}) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" className={cx('copy-btn', copied && 'is-copied')} onClick={() => copy(value, target?.current)}>
      <Icon name={copied ? 'check' : 'copy'} size={15} />
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

/** Animated number that eases from its previous value (respects reduced motion). */
export function useAnimatedNumber(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(origin + (target - origin) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
