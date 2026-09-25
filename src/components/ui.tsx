'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { useT } from '@/i18n/client';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-700/50',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 shadow-sm',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  subtle: 'bg-ink-100 text-ink-700 hover:bg-ink-200',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50', className)}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'brand'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-sky-50 text-sky-800 ring-sky-200',
    violet: 'bg-violet-50 text-violet-800 ring-violet-200',
    brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  } as const;
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

/** The partner firm vs own-client tag, used everywhere a task or source shows. */
export function SideTag({ side, partnerLabel }: { side: 'partner' | 'direct' | null | undefined; partnerLabel?: string }) {
  const t = useT();
  if (!side) return <Badge tone="neutral">{t('common.side.unknown')}</Badge>;
  return side === 'partner' ? <Badge tone="blue">{partnerLabel ?? t('common.side.partner')}</Badge> : <Badge tone="amber">{t('common.side.direct')}</Badge>;
}

export function ClientChip({ name, color }: { name: string | null | undefined; color?: string | null }) {
  const t = useT();
  if (!name) return <span className="text-xs italic text-ink-400">{t('common.noClient')}</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-ink-700">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? '#94a3b8' }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-ink-400', className)} />;
}

export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-ink-300">{icon}</div>}
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-ink-500">{hint}</p>}
      {action}
    </div>
  );
}

export function Card({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('card flex flex-col', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
          {action}
        </header>
      )}
      <div className={cx('flex-1', bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-ink-100 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs',
            value === o.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cx('card max-h-[90vh] w-full overflow-auto shadow-pop', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton label={t('common.close')} onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="px-5 py-4 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Right-hand drawer, the detail view pattern across the app. */
export function Drawer({ open, onClose, title, children, footer, width = 'max-w-xl' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string }) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('[role=dialog][aria-modal=true]:not([data-drawer])')) onClose();
    };
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink-900/20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} data-drawer role="dialog" aria-label={typeof title === 'string' ? title : undefined} className={cx('animate-slide-in flex h-full w-full flex-col bg-white shadow-pop outline-none', width)}>
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0 flex-1 text-base font-semibold text-ink-900">{title}</div>
          <IconButton label={t('common.close')} onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

type Toast = { id: number; message: string; tone: 'ok' | 'error'; action?: { label: string; run: () => void } };
const ToastContext = createContext<(message: string, opts?: { tone?: 'ok' | 'error'; action?: Toast['action'] }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, opts: { tone?: 'ok' | 'error'; action?: Toast['action'] } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone: opts.tone ?? 'ok', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.action ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-pop',
              t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-ink-900 text-white',
            )}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="font-semibold text-brand-200 hover:text-white"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-500">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
