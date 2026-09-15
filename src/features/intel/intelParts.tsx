// Small shared pieces for the intelligence and coverage pages.
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ApiError } from '@/api/client'
import { EmptyState, ErrorState, Icon } from '@/components/ui'
import { CELL_STYLE } from '@/components/map/AreaMap'
import { formatDelta } from './intelLogic'

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-[#EDE6D8]', className)} aria-hidden="true" />
}

/** 403 from a role- or module-gated endpoint gets a calm explanation instead of a raw error. */
export function QueryProblem({ error, onRetry, what }: { error: unknown; onRetry?: () => void; what: string }) {
  if (error instanceof ApiError && error.code === 'module_disabled') {
    return <EmptyState icon="extension_off" title={`${what} is not part of your licence`} text="Ask zrGISsolutions to enable the module for your organisation." />
  }
  if (error instanceof ApiError && error.status === 403) {
    return <EmptyState icon="lock" title={`${what} is limited to managers`} text="Your role can open this page, but the server only shares this data with managers and administrators." />
  }
  return <ErrorState error={error} onRetry={onRetry} />
}

/** Signed change with a trend icon. `goodWhenDown` colours decreases green (risk falling is good). */
export function Delta({ value, digits = 1, suffix, className, goodWhenDown = true }: { value: number | null; digits?: number; suffix?: string; className?: string; goodWhenDown?: boolean }) {
  if (value === null) return <span className={clsx('text-small text-ink-3', className)}>no previous day</span>
  const rounded = Number(value.toFixed(digits))
  const up = rounded > 0
  const flat = rounded === 0
  const tone = flat ? 'text-ink-3' : up === goodWhenDown ? 'text-danger' : 'text-mid-green'
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-small font-semibold whitespace-nowrap', tone, className)}>
      <Icon name={flat ? 'trending_flat' : up ? 'trending_up' : 'trending_down'} size={16} />
      {formatDelta(value, digits)}
      {suffix && <span className="font-normal text-ink-3">{suffix}</span>}
    </span>
  )
}

const LEVEL_KEYS = ['low', 'medium', 'high', 'critical'] as const

/** Legend for risk-level cell colours on the map (same styles as AreaMap CELL_STYLE). */
export function RiskLevelLegend({ className }: { className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <div className="flex h-2 overflow-hidden rounded-full">
        {LEVEL_KEYS.map((k) => (
          <span key={k} className="flex-1" style={{ background: CELL_STYLE[k].fill, opacity: 0.35 + CELL_STYLE[k].opacity * 2 }} />
        ))}
      </div>
      <div className="grid grid-cols-4 text-caption text-ink-3">
        <span>Low &lt; 3</span>
        <span>Medium 3–5.5</span>
        <span>High 5.5–7.5</span>
        <span className="text-right">Critical ≥ 7.5</span>
      </div>
    </div>
  )
}

export function StatBlock({ value, label, sub, tone }: { value: ReactNode; label: ReactNode; sub?: ReactNode; tone?: 'danger' | 'default' }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={clsx('text-[24px] leading-8 font-bold', tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</span>
      <span className="text-small text-ink-3">{label}</span>
      {sub}
    </div>
  )
}
