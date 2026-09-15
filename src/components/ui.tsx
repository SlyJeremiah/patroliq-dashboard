// Design-system primitives for the manager dashboard (Design Document s.5, web variants).
import clsx from 'clsx'
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Severity } from '@/api/types'

export function Icon({ name, size = 20, fill, className, label }: { name: string; size?: number; fill?: boolean; className?: string; label?: string }) {
  return (
    <span
      className={clsx('icon', fill && 'icon-fill', className)}
      style={{ fontSize: size, width: size, height: size }}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  )
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost' | 'light'

const buttonKinds: Record<ButtonKind, string> = {
  primary: 'bg-forest text-cream hover:bg-[#0A1E1A] disabled:bg-disabled disabled:text-grey',
  secondary: 'bg-white text-forest border-2 border-forest hover:bg-mint disabled:border-disabled disabled:text-disabled',
  danger: 'bg-danger text-white hover:bg-[#a93226] disabled:opacity-60',
  ghost: 'bg-transparent text-forest hover:bg-black/5 disabled:text-disabled',
  light: 'bg-cream text-forest hover:bg-[#efdcbd]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind
  icon?: string
  loading?: boolean
  size?: 'md' | 'sm'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { kind = 'primary', icon, loading, size = 'md', className, children, disabled, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-bold uppercase tracking-[0.03em] whitespace-nowrap transition-colors',
        size === 'md' ? 'h-11 px-4 text-[14px]' : 'h-8 px-3 text-[12px]',
        buttonKinds[kind],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={size === 'md' ? 18 : 14} /> : icon ? <Icon name={icon} size={size === 'md' ? 18 : 16} /> : null}
      {children}
    </button>
  )
})

export function IconButton({ icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button aria-label={label} title={label} className={clsx('inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-black/5', className)} {...rest}>
      <Icon name={icon} size={22} />
    </button>
  )
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      className={clsx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  )
}

export const severityColor: Record<Severity, string> = { critical: '#C0392B', high: '#E67E22', medium: '#2980B9', low: '#6C757D' }

export function SeverityBadge({ level, className }: { level: Severity; className?: string }) {
  return (
    <span
      className={clsx('inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-white', className)}
      style={{ background: severityColor[level] }}
    >
      {level}
    </span>
  )
}

export function StatusDot({ color, pulse, className }: { color: string; pulse?: 'active' | 'sos'; className?: string }) {
  return (
    <span
      className={clsx('inline-block h-2 w-2 rounded-full', className)}
      style={{ background: color, animation: pulse === 'sos' ? 'piq-sos 0.8s infinite' : pulse === 'active' ? 'piq-pulse 3s infinite' : undefined }}
    />
  )
}

export function Pill({ children, dot, className, tone = 'neutral' }: { children: ReactNode; dot?: string; className?: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const tones = { neutral: 'bg-black/5 text-ink', success: 'bg-mint text-forest', warning: 'bg-warn-bg text-[#7a4a12]', danger: 'bg-danger-bg text-[#8a2a20]', info: 'bg-info-bg text-[#1d5d87]' }
  return (
    <span className={clsx('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap', tones[tone], className)}>
      {dot && <StatusDot color={dot} />}
      {children}
    </span>
  )
}

export function Panel({ title, actions, children, className, bodyClassName, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx('flex min-h-0 flex-col rounded-xl bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex items-center gap-3 px-5 pt-4">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-h3 font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="text-small text-ink-3">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={clsx('min-h-0 flex-1 px-5 pb-5', title || actions ? 'pt-3' : 'pt-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function StatsRow({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'default' }[] }) {
  return (
    <div className="flex h-14 shrink-0 items-center border-b border-[#EDE4D3] bg-cream-tint">
      {items.map((it, i) => (
        <div key={it.label} className={clsx('flex flex-1 items-center gap-3 px-5', i > 0 && 'border-l border-[#EDE4D3]')}>
          <span className="overline">{it.label}</span>
          <span className={clsx('text-[22px] font-bold', it.tone === 'danger' ? 'text-danger' : 'text-forest')}>{it.value}</span>
          {it.sub && <span className="text-small text-ink-3">{it.sub}</span>}
        </div>
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end gap-4 px-6 pt-5 pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-h1 font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-small text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mint text-forest"><Icon name={icon} size={24} /></span>
      <p className="text-body font-semibold text-ink">{title}</p>
      {text && <p className="max-w-md text-small text-ink-3">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something did not load.'
  return (
    <div className="flex items-center gap-3 rounded-lg bg-danger-bg px-4 py-3 text-small text-[#8a2a20]">
      <Icon name="error" size={20} />
      <span className="flex-1">{message}</span>
      {onRetry && <Button kind="ghost" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function Banner({ tone = 'info', icon, title, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: string; title?: string; children?: ReactNode; action?: ReactNode }) {
  const t = {
    info: ['bg-info-bg', 'text-info', 'info'],
    warning: ['bg-warn-bg', 'text-amber', 'warning'],
    danger: ['bg-danger-bg', 'text-danger', 'error'],
    success: ['bg-mint', 'text-success', 'check_circle'],
  }[tone]
  return (
    <div className={clsx('flex items-start gap-3 rounded-lg px-4 py-3', t[0])}>
      <Icon name={icon ?? t[2]} size={20} className={t[1]} />
      <div className="min-w-0 flex-1 text-small text-ink-2">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children}
      </div>
      {action}
    </div>
  )
}

// ------------------------------------------------------------------ form controls (48px inputs on web)

export function Field({ label, htmlFor, helper, error, children, className }: { label: string; htmlFor?: string; helper?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-label font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[12px] text-danger"><Icon name="error" size={14} />{error}</p>
      ) : helper ? (
        <p className="text-[12px] text-ink-3">{helper}</p>
      ) : null}
    </div>
  )
}

const inputBase = 'h-12 w-full rounded-lg border-[1.5px] border-grey bg-white px-3.5 text-body text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-2 focus:border-forest disabled:bg-[#E9ECEF] disabled:text-disabled read-only:bg-readonly aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger'

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean }>(
  function TextInput({ className, mono, invalid, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={clsx(inputBase, mono && 'font-mono text-[14px]', className)} {...rest} />
  },
)

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputBase, 'h-auto min-h-24 py-3', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={clsx(inputBase, 'appearance-none pr-10', className)} {...rest}>{children}</select>
      <Icon name="expand_more" size={20} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; description?: string }) {
  return (
    <label className={clsx('flex items-center gap-3', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-forest' : 'bg-disabled')}
      >
        <span className={clsx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
      <span className="flex flex-col">
        <span className="text-small font-semibold text-ink">{label}</span>
        {description && <span className="text-[12px] text-ink-3">{description}</span>}
      </span>
    </label>
  )
}

export function Chip({ selected, onClick, children, icon, className }: { selected?: boolean; onClick?: () => void; children: ReactNode; icon?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors',
        selected ? 'border-forest bg-forest text-cream' : 'border-[#DDD5C5] bg-white text-ink-2 hover:bg-mint',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={16} /> : selected ? <Icon name="check" size={16} /> : null}
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string; icon?: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx('inline-flex rounded-lg border border-line bg-white p-1', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold', o.value === value ? 'bg-forest text-cream' : 'text-ink-2 hover:bg-black/5')}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: string; icon?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
          className={clsx('-mb-px inline-flex h-11 items-center gap-2 border-b-[3px] px-3 text-small font-semibold', t.value === value ? 'border-forest text-forest' : 'border-transparent text-ink-3 hover:text-ink')}
        >
          {t.icon && <Icon name={t.icon} size={18} />}
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ overlays

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 420 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" className="absolute inset-0 bg-forest/45" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className="relative flex h-full flex-col bg-white shadow-pop" style={{ width }}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-h3 font-semibold text-ink">{title}</h2>
            {subtitle && <p className="text-small text-ink-3">{subtitle}</p>}
          </div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button aria-label="Close" className="absolute inset-0 bg-forest/45" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-full flex-col rounded-xl bg-white shadow-pop" style={{ width }}>
        <header className="flex items-center gap-3 px-5 pt-4">
          <h2 className="flex-1 text-h3 font-semibold text-ink">{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
        <div className="scroll-thin min-h-0 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ data table

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, empty, dense }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; selectedKey?: string | null; empty?: ReactNode; dense?: boolean }) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing to show yet" />}</>
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="h-10 border-b border-line px-4 text-left text-label font-semibold whitespace-nowrap uppercase tracking-[0.06em] text-ink-3" style={{ width: c.width, textAlign: c.align }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const key = rowKey(r)
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={clsx(
                  i % 2 ? 'bg-[#FBF8F2]' : 'bg-white',
                  onRowClick && 'cursor-pointer hover:bg-cream/60',
                  selectedKey === key && '!bg-mint',
                )}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx('border-b border-line-soft px-4 text-small text-ink whitespace-nowrap', dense ? 'h-10' : 'h-13')} style={{ textAlign: c.align }}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Avatar({ name, color = '#1A6496', size = 32 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials}
    </span>
  )
}

export function ProgressBar({ value, color = '#2D6A4F', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-1.5 overflow-hidden rounded-full bg-[#E9DFCB]', className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  )
}
