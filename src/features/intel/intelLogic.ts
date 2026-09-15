// Pure helpers for the Intelligence and GRTS coverage pages (no React, unit-tested in intelLogic.test.ts).
import { addDays as addDaysFns, format, parseISO, subMonths } from 'date-fns'
import type { AlertItem, AreaRisk, CellRisk, Coverage, CoverageCell, RiskFactor, RiskTrendPoint, Severity } from '@/api/types'

// ------------------------------------------------------------------ risk

/** Level thresholds of the Phase 1 heuristic engine (backend/areas/risk.py): < 3 low · < 5.5 medium · < 7.5 high · else critical. */
export const RISK_HIGH_THRESHOLD = 5.5
export const RISK_CRITICAL_THRESHOLD = 7.5

export const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }

/** Adds days to a `YYYY-MM-DD` date and returns `YYYY-MM-DD`. */
export function shiftDate(iso: string, days: number): string {
  return format(addDaysFns(parseISO(iso), days), 'yyyy-MM-dd')
}

/** The engine writes labels such as "Last patrolled 5 day(s) ago"; turn "(s)" into proper singular/plural wording. */
export function plainFactorLabel(label: string): string {
  return label.replace(/(\d[\d,.]*)([^()\d]*?)\(s\)/g, (_m, num: string, words: string) => {
    const n = Number(num.replace(/,/g, ''))
    return `${num}${words}${n === 1 ? '' : 's'}`
  })
}

export interface FactorContribution {
  key: string
  label: string
  weight: number
  value: number
  /** Points this factor adds to the 0–10 score (10 × weight × value). */
  points: number
}

/** Factors sorted by how much they add to the score, largest first. */
export function factorContributions(factors: RiskFactor[]): FactorContribution[] {
  return factors
    .map((f) => {
      const value = typeof f.value === 'number' ? f.value : Number(f.value ?? 0) || 0
      return { key: f.key, label: plainFactorLabel(f.label), weight: f.weight, value, points: round2(10 * f.weight * value) }
    })
    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label))
}

export interface RankedCell {
  rank: number
  cell: CellRisk
  /** Score change vs the previous scored day; null when the previous day has no score for the cell. */
  delta: number | null
  topFactors: FactorContribution[]
}

function inSector<T extends { sector_id?: string | null }>(items: T[], sectorId?: string | null): T[] {
  return sectorId ? items.filter((c) => c.sector_id === sectorId) : items
}

/** Highest-risk cells (score desc, then label) with the change vs the previous day and their top contributing factors. */
export function rankRiskCells(cells: CellRisk[], previous: CellRisk[] | null | undefined, opts: { sectorId?: string | null; limit?: number; factors?: number } = {}): RankedCell[] {
  const prevById = new Map((previous ?? []).map((c) => [c.cell_id, c.score]))
  return [...inSector(cells, opts.sectorId)]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, opts.limit ?? 5)
    .map((cell, i) => {
      const prev = prevById.get(cell.cell_id)
      return {
        rank: i + 1,
        cell,
        delta: prev === undefined ? null : round2(cell.score - prev),
        topFactors: factorContributions(cell.factors).filter((f) => f.points > 0).slice(0, opts.factors ?? 3),
      }
    })
}

export interface RiskOverview {
  cells: number
  /** Cells at high or critical level. */
  elevated: number
  elevatedDelta: number | null
  mean: number | null
  meanDelta: number | null
  byLevel: Record<Severity, number>
}

export function riskOverview(cells: CellRisk[], previous: CellRisk[] | null | undefined, sectorId?: string | null): RiskOverview {
  const cur = inSector(cells, sectorId)
  const prev = previous ? inSector(previous, sectorId) : null
  const byLevel: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  cur.forEach((c) => (byLevel[c.level] += 1))
  const elevated = byLevel.high + byLevel.critical
  const mean = cur.length ? round2(cur.reduce((s, c) => s + c.score, 0) / cur.length) : null
  const prevElevated = prev && prev.length ? prev.filter((c) => c.level === 'high' || c.level === 'critical').length : null
  const prevMean = prev && prev.length ? prev.reduce((s, c) => s + c.score, 0) / prev.length : null
  return {
    cells: cur.length,
    elevated,
    elevatedDelta: prevElevated === null ? null : elevated - prevElevated,
    mean,
    meanDelta: mean === null || prevMean === null ? null : round2(mean - prevMean),
    byLevel,
  }
}

/** Previous-day scores only count when the API really returned an earlier date (it falls back to the latest date ≤ requested). */
export function previousDayCells(current: AreaRisk | undefined, previous: AreaRisk | undefined): CellRisk[] | null {
  if (!current || !previous || !previous.cells.length) return null
  return previous.date < current.date ? previous.cells : null
}

export interface TrendRow {
  date: string
  label: string
  mean: number | null
  max: number | null
  high: number
  critical: number
  elevated: number
}

export function trendRows(points: RiskTrendPoint[]): TrendRow[] {
  return points.map((p) => ({
    date: p.date,
    label: format(parseISO(p.date), 'd MMM'),
    mean: p.mean_score,
    max: p.max_score,
    high: p.high_cells,
    critical: p.critical_cells,
    elevated: p.high_cells + p.critical_cells,
  }))
}

/** Last row that has a score (for direct end-of-line labels). */
export function lastScored(rows: TrendRow[]): TrendRow | null {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].mean !== null) return rows[i]
  return null
}

/** Score history for one cell from several daily risk responses; duplicate resolved dates (fallbacks) are dropped. */
export function cellScoreHistory(days: (AreaRisk | undefined)[], cellId: string): { date: string; label: string; score: number | null; level: Severity | null }[] {
  const byDate = new Map<string, { score: number | null; level: Severity | null }>()
  for (const d of days) {
    if (!d || byDate.has(d.date) || !d.cells.length) continue
    const c = d.cells.find((x) => x.cell_id === cellId)
    byDate.set(d.date, { score: c?.score ?? null, level: c?.level ?? null })
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, label: format(parseISO(date), 'd MMM'), ...v }))
}

export function formatDelta(delta: number | null, digits = 1): string {
  if (delta === null) return '—'
  const r = Number(delta.toFixed(digits))
  if (r === 0) return `±${(0).toFixed(digits)}`
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(digits)}`
}

export interface ConfidenceInfo {
  phase: string
  engineLabel: string
  /** 0 low · 1 moderate · 2 high */
  step: number
  levelLabel: string
  explanation: string
}

export function confidenceInfo(engine: AreaRisk['engine'], confidence: AreaRisk['model_confidence']): ConfidenceInfo {
  const step = { low: 0, moderate: 1, high: 2 }[confidence] ?? 0
  const levelLabel = { low: 'Low', moderate: 'Moderate', high: 'High' }[confidence] ?? 'Low'
  const dataNote = {
    low: 'Under 20 patrols and observations in 90 days, so scores lean on geography.',
    moderate: '20–200 patrols and observations in 90 days feed the patrol and incident factors.',
    high: 'Over 200 patrols and observations in 90 days keep patrol and incident factors current.',
  }[confidence]
  if (engine === 'ml') {
    return {
      phase: 'Phase 2',
      engineLabel: 'Machine-learning model',
      step,
      levelLabel,
      explanation: `Scores come from the trained model; the listed factors show what drove each cell. ${dataNote}`,
    }
  }
  return {
    phase: 'Phase 1',
    engineLabel: 'Rule-based heuristic engine',
    step,
    levelLabel,
    explanation: `Every score is the sum of its listed factors; no training data. ${dataNote}`,
  }
}

/** Open alerts for the compact feed: severity first, then most recent. */
export function feedAlerts(alerts: AlertItem[], opts: { cellIds?: Set<string> | null; limit?: number } = {}): AlertItem[] {
  return alerts
    .filter((a) => a.status === 'active' || a.status === 'acknowledged')
    .filter((a) => !opts.cellIds || (a.cell_id != null && opts.cellIds.has(a.cell_id)))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, opts.limit ?? 6)
}

export function alertTitle(a: AlertItem): string {
  if (a.title) return a.title
  const kind = a.kind.replace(/_/g, ' ')
  if (a.type === 'safety') return a.kind === 'dead_mans_switch' ? "Dead man's switch" : 'Panic alert'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

// ------------------------------------------------------------------ coverage

export interface MonthOption {
  value: string
  label: string
}

/** The current month and the previous `count - 1` months, newest first. */
export function monthOptions(todayIso: string, count = 12): MonthOption[] {
  const today = parseISO(todayIso)
  return Array.from({ length: count }, (_, i) => {
    const d = subMonths(today, i)
    return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') }
  })
}

export function monthLabel(month: string, pattern = 'MMMM yyyy'): string {
  return format(parseISO(`${month}-01`), pattern)
}

/** Sector under-surveyed rule: below 40 % complete, or at least 15 points below the reserve-wide coverage. */
export const UNDER_SURVEYED_MIN = 0.4
export const UNDER_SURVEYED_GAP = 0.15

export function isUnderSurveyed(sectorPct: number, reservePct: number): boolean {
  return sectorPct < UNDER_SURVEYED_MIN || reservePct - sectorPct >= UNDER_SURVEYED_GAP - 1e-9
}

export interface SectorRow {
  id: string
  name: string
  cells: number
  complete: number
  partial: number
  pending: number
  never: number
  pct: number
  underSurveyed: boolean
}

/** Sector cards: `never` is derived when the API omits it (cells = complete + partial + pending + never). */
export function sectorRows(coverage: Coverage): SectorRow[] {
  return coverage.sectors.map((s) => {
    const raw = (s as { never?: number }).never
    const never = typeof raw === 'number' ? raw : Math.max(0, s.cells - s.complete - s.partial - s.pending)
    return {
      id: s.id,
      name: s.name,
      cells: s.cells,
      complete: s.complete,
      partial: s.partial,
      pending: s.pending,
      never,
      pct: s.coverage_pct,
      underSurveyed: s.cells > 0 && isUnderSurveyed(s.coverage_pct, coverage.coverage_pct),
    }
  })
}

export function statusCounts(cells: CoverageCell[]): Record<CoverageCell['status'], number> {
  const out = { complete: 0, partial: 0, pending: 0, never: 0 }
  cells.forEach((c) => (out[c.status] += 1))
  return out
}

/** 0–1 intensity for the visit layer: visits relative to the target, capped at 1. */
export function visitIntensity(visits: number, target: number): number {
  if (visits <= 0) return 0
  return Math.min(1, visits / Math.max(1, target))
}

/** `[since, until)` ISO bounds of a `YYYY-MM` month (local calendar, sent as dates). */
export function monthBounds(month: string): { since: string; until: string } {
  const start = parseISO(`${month}-01`)
  const next = format(addDaysFns(new Date(start.getFullYear(), start.getMonth() + 1, 1), 0), 'yyyy-MM-dd')
  return { since: `${month}-01`, until: next }
}

/** Label point for a cell: the additive `centroid` property when present, else the mean of the outer ring's vertices. */
export function cellCenter(geometry: { coordinates: number[][][] }, centroid?: { coordinates: number[] } | null): [number, number] | null {
  if (centroid?.coordinates?.length === 2) return [centroid.coordinates[0], centroid.coordinates[1]]
  const ring = geometry.coordinates[0] ?? []
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring
  if (!pts.length) return null
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}

export function shortSectorName(name: string): string {
  return name.replace(/\s+sector$/i, '')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
