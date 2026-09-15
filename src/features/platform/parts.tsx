// Small presentational pieces for the platform console.
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { Button, Icon, Modal } from '@/components/ui'
import { PLANS, SEAT_COLOR, orgMark, seatUsage, type OrgStatus, type Plan } from './platformLogic'

const STATUS_BG: Record<OrgStatus, string> = { active: '#27AE60', grace: '#E67E22', suspended: '#C0392B' }

export function StatusBadge({ status, className }: { status: OrgStatus; className?: string }) {
  return (
    <span
      className={clsx('inline-flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-[11px] font-bold whitespace-nowrap uppercase tracking-[0.05em] text-white', className)}
      style={{ background: STATUS_BG[status] }}
    >
      {status}
    </span>
  )
}

export function OrgMark({ code, muted, size = 40 }: { code: string; muted?: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-lg font-bold tracking-[0.02em]', muted ? 'bg-[#E9ECEF] text-ink-3' : 'bg-forest text-cream')}
      style={{ width: size, height: size, fontSize: size >= 44 ? 13 : 11 }}
    >
      {orgMark(code)}
    </span>
  )
}

export function SeatBar({ used, limit, muted, className }: { used: number; limit: number; muted?: boolean; className?: string }) {
  const s = seatUsage(used, limit)
  return (
    <div className={clsx('h-[5px] overflow-hidden rounded-full bg-[#E9DFCB]', className)} aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.min(1, s.pct) * 100}%`, background: muted ? '#6C757D' : SEAT_COLOR[s.level] }} />
    </div>
  )
}

export function PlanPicker({ value, onChange, disabled }: { value: Plan; onChange: (p: Plan) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Licence plan" className="grid grid-cols-3 overflow-hidden rounded-lg border-[1.5px] border-line">
      {PLANS.map((p, i) => {
        const on = p.value === value
        return (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(p.value)}
            className={clsx(
              'inline-flex h-11 items-center justify-center gap-1.5 text-[13px] font-semibold transition-colors',
              i > 0 && 'border-l-[1.5px] border-line',
              on ? 'bg-forest text-cream' : 'bg-white text-ink hover:bg-cream-tint',
            )}
          >
            {on && <Icon name="check" size={16} className="text-emerald" />}
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

export function ModuleSwitch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex h-11 items-center justify-between gap-2 rounded-lg border-[1.5px] px-3 text-left text-[13px] font-semibold transition-colors',
        checked ? 'border-line bg-cream-tint text-ink' : 'border-line bg-white text-ink-3',
        disabled ? 'opacity-60' : 'hover:border-mid-green',
      )}
    >
      <span className="truncate">{label}</span>
      <span className={clsx('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-forest' : 'bg-[#DDE1E4]')}>
        <span className={clsx('absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </span>
    </button>
  )
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-label font-semibold uppercase tracking-[0.06em] text-ink-3">{children}</h3>
      {aside && <span className="text-caption text-ink-3">{aside}</span>}
    </div>
  )
}

export function DeploymentChoice({ value, onChange, disabled }: { value: 'shared' | 'dedicated'; onChange: (v: 'shared' | 'dedicated') => void; disabled?: boolean }) {
  const opts = [
    { v: 'shared' as const, icon: 'cloud', title: 'Shared cloud', text: 'Tenant isolation, RLS' },
    { v: 'dedicated' as const, icon: 'dns', title: 'Dedicated instance', text: 'Own database and server' },
  ]
  return (
    <div role="radiogroup" aria-label="Deployment" className="grid grid-cols-2 gap-3">
      {opts.map((o) => {
        const on = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={clsx(
              'flex min-h-14 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
              on ? 'border-2 border-forest bg-mint' : 'border-[1.5px] border-line bg-white hover:bg-cream-tint',
            )}
          >
            <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-forest' : 'border-disabled')}>
              {on && <span className="h-2.5 w-2.5 rounded-full bg-forest" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink"><Icon name={o.icon} size={16} />{o.title}</span>
              <span className="block text-[12px] text-ink-2">{o.text}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function PrivacyNote({ compact }: { compact?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2.5 rounded-lg bg-mint text-[13px] leading-[18px] font-semibold text-forest', compact ? 'px-3 py-2' : 'px-3 py-2.5')}>
      <Icon name="visibility_off" size={18} />
      <span>Platform staff see licence usage only — never patrols, observations or positions.</span>
    </div>
  )
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</span>
      <div className="flex items-center gap-2">
        <code className="mono flex h-12 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border-[1.5px] border-line bg-readonly px-3.5 text-[14px] whitespace-nowrap text-ink select-all">{value}</code>
        <Button
          kind="secondary"
          icon={copied ? 'check' : 'content_copy'}
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open, title, children, confirmLabel, tone = 'primary', loading, error, onConfirm, onClose,
}: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger'; loading?: boolean; error?: string | null
  onConfirm: () => void; onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={460}
      footer={
        <>
          <Button kind="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button kind={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-small text-ink-2">
        {children}
        {error && <p className="flex items-center gap-1.5 text-danger"><Icon name="error" size={16} />{error}</p>}
      </div>
    </Modal>
  )
}
