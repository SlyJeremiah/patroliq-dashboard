// Shared UI pieces for the admin feature.
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import type { ApuBase, Area } from '@/api/types'
import { Button, Icon, Modal } from '@/components/ui'
import { boundarySvgPath, svgProjector } from './geometry'

export function AreaStatusBadge({ status, className }: { status: Area['status']; className?: string }) {
  const tone = { active: 'bg-success text-white', draft: 'bg-grey text-white', archived: 'bg-[#E9ECEF] text-ink-2' }[status]
  return (
    <span className={clsx('inline-flex h-[22px] items-center rounded-full px-2.5 text-[11px] font-bold tracking-[0.06em] uppercase', tone, className)}>
      {status}
    </span>
  )
}

export function OutlineTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full border border-[#CFC6B4] px-2.5 text-[11px] font-bold tracking-[0.06em] text-ink-2 uppercase">
      {children}
    </span>
  )
}

/** Inline SVG thumbnail of an area boundary with its APU bases (north up). */
export function AreaThumb({ area, bases = [], size = 150 }: { area: Pick<Area, 'boundary' | 'name'>; bases?: ApuBase[]; size?: number }) {
  const d = boundarySvgPath(area.boundary, size, size, 14)
  const project = svgProjector(area.boundary, size, size, 14)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={d ? `Boundary of ${area.name}` : `${area.name} has no boundary yet`}
      className="shrink-0 rounded-lg"
      style={{ background: '#1B4332' }}
    >
      <defs>
        <pattern id="piq-thumb-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="rgba(247,231,206,0.07)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={size} height={size} fill="url(#piq-thumb-grid)" />
      {d ? (
        <path d={d} fill="rgba(82,183,136,0.28)" stroke="#F7E7CE" strokeWidth={2} strokeLinejoin="round" fillRule="evenodd" />
      ) : (
        <>
          <rect x={22} y={22} width={size - 44} height={size - 44} rx={10} fill="none" stroke="rgba(247,231,206,0.45)" strokeWidth={2} strokeDasharray="6 5" />
          <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={12} fill="rgba(247,231,206,0.7)" fontFamily="Inter, sans-serif">
            No boundary
          </text>
        </>
      )}
      {project &&
        bases.map((b) => {
          const [x, y] = project(b.location.coordinates)
          return <rect key={b.id} x={x - 4} y={y - 4} width={8} height={8} rx={2} fill="#F7E7CE" stroke="#102C26" strokeWidth={1.5} />
        })}
    </svg>
  )
}

export type StepState = 'done' | 'current' | 'todo'

export function StepCircle({ n, state, size = 28 }: { n: number; state: StepState; size?: number }) {
  if (state === 'done') {
    return (
      <span className="flex shrink-0 items-center justify-center rounded-full bg-mid-green text-white" style={{ width: size, height: size }}>
        <Icon name="check" size={size * 0.62} />
      </span>
    )
  }
  return (
    <span
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
        state === 'current' ? 'bg-forest text-cream shadow-[0_0_0_3px_#D8F3DC]' : 'border-[1.5px] border-[#BDB5A6] text-ink-3',
      )}
      style={{ width: size, height: size }}
    >
      {n}
    </span>
  )
}

export function BottomBar({ children }: { children: ReactNode }) {
  return <div className="flex h-[64px] shrink-0 items-center gap-6 border-t border-line bg-cream-tint px-6">{children}</div>
}

export function Metric({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <span className={clsx('text-body font-semibold text-ink', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

export function ConfirmModal({
  open, title, children, confirmLabel, onConfirm, onClose, danger, loading, error,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  danger?: boolean
  loading?: boolean
  error?: ReactNode
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>Cancel</Button>
          <Button kind={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body text-ink-2">
        {children}
        {error}
      </div>
    </Modal>
  )
}

export function CopyField({ label, value, mono = true, secret }: { label: string; value: string; mono?: boolean; secret?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [shown, setShown] = useState(!secret)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <div className="flex min-h-12 items-center gap-2 rounded-lg border-[1.5px] border-grey bg-readonly py-1.5 pr-1.5 pl-3.5">
        <span className={clsx('min-w-0 flex-1 text-[14px] break-all text-ink', mono && 'font-mono')}>{shown ? value : '•'.repeat(Math.min(14, value.length))}</span>
        {secret && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? `Hide ${label}` : `Show ${label}`}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-3 hover:bg-black/5"
          >
            <Icon name={shown ? 'visibility_off' : 'visibility'} size={18} />
          </button>
        )}
        <Button kind="secondary" size="sm" icon={copied ? 'check' : 'content_copy'} onClick={copy} aria-label={`Copy ${label}`} className="h-9 border-[1.5px]">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

/** Small uppercase heading used in side panels. */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase flex-1">{children}</span>
      {aside && <span className="text-[12px] text-ink-3">{aside}</span>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-[#EAE3D5]', className)} />
}
